// ShipsGo container tracking proxy.
//
// Browser receives a container number, this function looks it up via the
// ShipsGo v2 API server-side (SHIPSGO_API_KEY is a Supabase secret), maps
// the response to the shape our `shipments` table expects, and returns it.
//
// Deploy:
//   supabase functions deploy shipsgo-track
// Required secret:
//   supabase secrets set SHIPSGO_API_KEY=sg_xxx

const ALLOWED_ORIGIN_REGEX = /^https:\/\/nir-sigma-liard(-[a-z0-9-]+)?\.vercel\.app$/;
const ALLOWED_ORIGINS = new Set([
  'https://nir-sigma-liard.vercel.app',
  'http://localhost:3000',
]);

const SHIPSGO_CONTAINER = 'https://api.shipsgo.com/v2/tracking/container';
const SHIPSGO_AWB       = 'https://api.shipsgo.com/v2/tracking/airwaybill';

function corsHeaders(origin: string | null) {
  const allow = origin && (ALLOWED_ORIGINS.has(origin) || ALLOWED_ORIGIN_REGEX.test(origin))
    ? origin
    : 'https://nir-sigma-liard.vercel.app';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Vary': 'Origin',
  };
}

type ShipsGoResponse = Record<string, unknown>;

function pickStr(obj: any, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = k.split('.').reduce<any>((acc, part) => (acc == null ? acc : acc[part]), obj);
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return null;
}

function pickDate(obj: any, ...keys: string[]): string | null {
  const raw = pickStr(obj, ...keys);
  if (!raw) return null;
  // Try to parse, then format as YYYY-MM-DD.
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Map ShipsGo response (defensive — tries several field names) to our schema.
function mapShipsGo(raw: ShipsGoResponse) {
  // ShipsGo v2 often wraps in `data`; sometimes returns top-level.
  const root: any = (raw as any).data ?? raw;
  const movements: any[] = root.movements || root.events || root.containerMovements || [];

  const eventList = movements.map(m => ({
    date:           pickDate(m, 'date', 'eventDate', 'timestamp', 'movementDate'),
    location:       pickStr(m, 'location', 'locationName', 'port.name', 'place'),
    description:    pickStr(m, 'description', 'event', 'eventDescription', 'statusDescription', 'status'),
    vessel_voyage:  [
      pickStr(m, 'vessel', 'vesselName', 'vessel.name'),
      pickStr(m, 'voyage', 'voyageNumber', 'voyageCode'),
    ].filter(Boolean).join(' ').trim(),
    terminal:       pickStr(m, 'terminal', 'terminalName', 'facility', 'facilityName'),
  })).filter(e => e.date || e.description);

  return {
    container_number:    pickStr(root, 'containerNumber', 'container.number', 'number'),
    container_type:      pickStr(root, 'containerType', 'container.type', 'isoCode'),
    carrier:             pickStr(root, 'shippingLine', 'carrier', 'shippingLineName', 'line'),
    vessel_name:         pickStr(root, 'vessel', 'vesselName', 'vessel.name', 'currentVessel'),
    voyage:              pickStr(root, 'voyage', 'voyageNumber', 'voyageCode'),
    origin_port:         pickStr(root, 'fromPort.name', 'pol.name', 'portOfLoading.name', 'origin.name', 'fromPort', 'pol'),
    pod_port:            pickStr(root, 'toPort.name',   'pod.name', 'portOfDischarge.name', 'destination.name', 'toPort', 'pod'),
    departure_date:      pickDate(root, 'fromPort.date', 'pol.date', 'departureDate', 'atd', 'etd'),
    eta_date:            pickDate(root, 'toPort.eta',   'pod.eta',   'eta', 'estimatedArrival'),
    actual_arrival_date: pickDate(root, 'toPort.ata',   'pod.ata',   'ata', 'actualArrival'),
    terminal:            pickStr(root, 'toPort.terminal', 'pod.terminal', 'terminalName'),
    events:              eventList,
    _raw:                raw,   // for debugging the first call; client will drop this
  };
}

async function callShipsGo(token: string, trackingNumber: string, mode: 'sea' | 'air', shippingLine?: string) {
  const base = mode === 'air' ? SHIPSGO_AWB : SHIPSGO_CONTAINER;
  const numberKey = mode === 'air' ? 'airWaybillNumber' : 'containerNumber';
  const carrierKey = mode === 'air' ? 'airline' : 'shippingLine';

  // Try POST to register first (idempotent — ShipsGo returns existing record if already tracked)
  const postBodyObj: Record<string, string> = { [numberKey]: trackingNumber };
  if (shippingLine) postBodyObj[carrierKey] = shippingLine;

  const postRes = await fetch(base, {
    method: 'POST',
    headers: {
      'X-Shipsgo-User-Token': token,
      'Authorization': `Bearer ${token}`,   // belt-and-suspenders for v2 variants
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(postBodyObj),
  });
  const postBody = await postRes.text();

  // Now GET the current state.
  const getUrl = `${base}/${encodeURIComponent(trackingNumber)}`;
  const getRes = await fetch(getUrl, {
    headers: {
      'X-Shipsgo-User-Token': token,
      'Authorization': `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const getBody = await getRes.text();

  let data: ShipsGoResponse = {};
  try { data = JSON.parse(getBody); } catch { /* leave empty */ }

  return {
    httpStatus: getRes.status,
    postStatus: postRes.status,
    postBody:   postBody.slice(0, 500),  // truncated for debug
    data,
    mode,
  };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const token = Deno.env.get('SHIPSGO_API_KEY');
  if (!token) {
    return new Response(JSON.stringify({ error: 'SHIPSGO_API_KEY not set on the server' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let body: { containerNumber?: string; shippingLine?: string; mode?: 'sea' | 'air' } = {};
  try { body = await req.json(); } catch {}
  const containerNumber = (body.containerNumber || '').trim().toUpperCase();
  if (!containerNumber) {
    return new Response(JSON.stringify({ error: 'containerNumber is required' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const mode: 'sea' | 'air' = body.mode === 'air' ? 'air' : 'sea';

  try {
    const result = await callShipsGo(token, containerNumber, mode, body.shippingLine);
    if (result.httpStatus >= 400) {
      return new Response(JSON.stringify({
        error: 'ShipsGo returned an error',
        httpStatus: result.httpStatus,
        postStatus: result.postStatus,
        postBody: result.postBody,
        data: result.data,
      }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const mapped = mapShipsGo(result.data);
    return new Response(JSON.stringify(mapped), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
