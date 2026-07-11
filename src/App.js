import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from './lib/supabase';
import { DEFAULT_SETTINGS, PROJECT_SETTINGS_KEYS } from './lib/calculations';
import { fetchUsdRate } from './lib/exchangeRate';
import { getActiveFreight } from './lib/freightHistory';
import { loadMarketRates, saveMarketRate } from './lib/marketRates';
import { loadContainerTypes, loadContainerPricing } from './lib/containerSelection';
import { syncContainerPricingFromMarket } from './lib/pricingSync';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import AdvisorPage from './components/AdvisorPage';
import FinancePage from './components/FinancePage';
import ProductsPage from './components/ProductsPage';
import ProjectsPage from './components/ProjectsPage';
import SettingsPage from './components/SettingsPage';
import BreakdownPage from './components/BreakdownPage';
import CompliancePage from './components/CompliancePage';
import DocumentsPage from './components/DocumentsPage';
import ConfirmDialogHost from './components/ConfirmDialog';

const FREIGHT_STALE_DAYS = 3;

// String-typed setting keys (must not be cast to Number)
const STRING_KEYS = new Set([
  'margin_type',
  'incoterms', 'shipping_method', 'sea_type', 'origin_port',
]);

function mergeSettings(global, overrides) {
  const merged = { ...global };
  PROJECT_SETTINGS_KEYS.forEach(k => {
    if (overrides[k] !== null && overrides[k] !== undefined) {
      merged[k] = STRING_KEYS.has(k) ? String(overrides[k]) : Number(overrides[k]);
    }
  });
  return merged;
}

function parseRow(data) {
  const s = {};
  Object.keys(DEFAULT_SETTINGS).forEach(k => {
    if (data[k] !== null && data[k] !== undefined) {
      s[k] = STRING_KEYS.has(k) ? String(data[k]) : Number(data[k]);
    }
  });
  return s;
}

export default function App() {
  const [page, setPage]         = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [toasts, setToasts]         = useState([]);
  const [freightHistory, setFreightHistory]   = useState([]);
  const [lastRateFetchAt, setLastRateFetchAt] = useState(null);
  const [marketRates, setMarketRates]         = useState([]);
  const [containerTypes, setContainerTypes]   = useState([]);
  const [containerPricing, setContainerPricing] = useState([]);

  const [globalSettings, setGlobalSettings]     = useState(DEFAULT_SETTINGS);
  const [projectOverrides, setProjectOverrides] = useState({});

  const settings = mergeSettings(globalSettings, projectOverrides);

  const [activeProjectId, setActiveProjectId_] = useState(
    () => localStorage.getItem('lc_activeProjectId') || null
  );
  const activeProjectIdRef = useRef(activeProjectId);
  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);

  const showToast = useCallback((msg, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  function setActiveProjectId(id) {
    setActiveProjectId_(id);
    if (id) localStorage.setItem('lc_activeProjectId', id);
    else     localStorage.removeItem('lc_activeProjectId');
  }

  useEffect(() => { loadProjects(); loadProducts(); }, []);

  useEffect(() => {
    async function autoFetchRate() {
      const rate = await fetchUsdRate();
      if (!rate) return;
      console.log('Fetched rate:', rate);
      setGlobalSettings(g => ({ ...g, usd_rate: rate }));
      setLastRateFetchAt(new Date());
      await supabase.from('settings')
        .upsert({ id: 'global', project_id: null, usd_rate: rate }, { onConflict: 'id' });
    }

    async function initFreight() {
      try {
        const { data } = await supabase
          .from('freight_history').select('*').order('valid_from', { ascending: false });
        if (data) setFreightHistory(data);
        const active = await getActiveFreight(supabase, activeProjectIdRef.current);
        if (active) setGlobalSettings(g => ({ ...g, freight: active }));
      } catch {
        // freight_history table not yet created — ignore
      }
    }

    async function initMarketRates() {
      let data = await loadMarketRates(supabase);
      setMarketRates(data);

      // Always auto-fetch on mount — same pattern as the USD rate fetch.
      const updated = await autoFetchFreight(data);
      if (updated) {
        data = await loadMarketRates(supabase);
        setMarketRates(data);
      }

      // Warn only about rates we can't auto-fetch (LCL, Air).
      warnIfManualRatesStale(data);
    }

    async function autoFetchFreight(currentRates) {
      try {
        const { data, error } = await supabase.functions.invoke('freight-rates-fetch');
        if (error || !data?.available || !data?.rates) return false;

        // Always save — refreshes updated_at so the staleness badge clears
        // even if the value itself didn't change. Toast only when value
        // genuinely changed.
        const changes = [];
        for (const [param, value] of Object.entries(data.rates)) {
          if (typeof value !== 'number' || value <= 0) continue;
          const current = currentRates.find(r => r.parameter === param);
          const valueChanged = !current || Math.abs(Number(current.value) - value) >= 0.5;
          await saveMarketRate(supabase, param, value);
          if (valueChanged) {
            changes.push({ param, oldValue: current?.value, newValue: value });
          }
        }

        if (changes.length > 0) {
          const fcl = changes.find(c => c.param === 'fcl_40ft_china_med');
          if (fcl && fcl.oldValue) {
            showToast(`FCL: $${Math.round(fcl.oldValue)} → $${Math.round(fcl.newValue)} (FBX13)`);
          }
          // Cascade: update container_pricing rows that are still in 'auto' mode.
          const freshRates  = await loadMarketRates(supabase);
          const freshPricing = await loadContainerPricing();
          const syncedCount = await syncContainerPricingFromMarket(freshRates, freshPricing);
          if (syncedCount > 0) {
            const refreshedPricing = await loadContainerPricing();
            setContainerPricing(refreshedPricing);
          }
        }
        return true;
      } catch {
        return false;
      }
    }

    function warnIfManualRatesStale(rates) {
      // All 3 rates are now auto-fetched. If any is stale here, the
      // auto-fetch failed (network / Freightos down / Edge Function broken).
      if (!rates || rates.length === 0) return;
      const allParams = ['fcl_40ft_china_med', 'lcl_per_cbm', 'air_per_kg'];
      const tracked = allParams
        .map(p => rates.find(r => r.parameter === p))
        .filter(Boolean);
      if (tracked.length === 0) return;
      const oldest = tracked.reduce((min, r) =>
        !min || r.updated_at < min ? r.updated_at : min, null);
      const days = Math.floor((Date.now() - new Date(oldest).getTime()) / 86_400_000);
      if (days >= FREIGHT_STALE_DAYS) {
        showToast(
          `⚠️ שערי שילוח לא עודכנו ${days} ימים — בדוק חיבור או נסה שוב`,
          'error',
        );
      }
    }

    async function initContainers() {
      const [types, pricing] = await Promise.all([
        loadContainerTypes(),
        loadContainerPricing(),
      ]);
      setContainerTypes(types);
      setContainerPricing(pricing);
    }

    autoFetchRate();
    initFreight();
    initMarketRates();
    initContainers();
    const rateInterval = setInterval(autoFetchRate, 6 * 60 * 60 * 1000);
    // Re-fetch freight rate every 6 hours for long-running tabs.
    const freightInterval = setInterval(async () => {
      const fresh = await loadMarketRates(supabase);
      const changed = await autoFetchFreight(fresh);
      if (changed) {
        const refreshed = await loadMarketRates(supabase);
        setMarketRates(refreshed);
      }
    }, 6 * 60 * 60 * 1000);
    return () => {
      clearInterval(rateInterval);
      clearInterval(freightInterval);
    };
  }, []); // eslint-disable-line
  useEffect(() => { loadEffectiveSettings(activeProjectId); }, [activeProjectId]); // eslint-disable-line
  useEffect(() => {
    if (activeProjectId && projects.length > 0) {
      if (!projects.find(p => p.id === activeProjectId)) setActiveProjectId(null);
    }
  }, [projects]); // eslint-disable-line

  useEffect(() => {
    const prodCh = supabase.channel('products-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, payload => {
        if (payload.eventType === 'INSERT')      setProducts(prev => prev.some(p => p.id === payload.new.id) ? prev : [...prev, payload.new]);
        else if (payload.eventType === 'UPDATE') setProducts(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
        else if (payload.eventType === 'DELETE') setProducts(prev => prev.filter(p => p.id !== payload.old.id));
      }).subscribe();

    const projCh = supabase.channel('projects-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, payload => {
        if (payload.eventType === 'INSERT')      setProjects(prev => prev.some(p => p.id === payload.new.id) ? prev : [payload.new, ...prev]);
        else if (payload.eventType === 'UPDATE') setProjects(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
        else if (payload.eventType === 'DELETE') {
          setProjects(prev => prev.filter(p => p.id !== payload.old.id));
          if (activeProjectIdRef.current === payload.old.id) setActiveProjectId(null);
        }
      }).subscribe();

    const settingsCh = supabase.channel('settings-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => {
        loadEffectiveSettings(activeProjectIdRef.current);
      }).subscribe();

    const pricingCh = supabase.channel('container-pricing-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'container_pricing' }, async () => {
        const fresh = await loadContainerPricing();
        setContainerPricing(fresh);
      }).subscribe();

    return () => {
      supabase.removeChannel(prodCh);
      supabase.removeChannel(projCh);
      supabase.removeChannel(settingsCh);
      supabase.removeChannel(pricingCh);
    };
  }, []); // eslint-disable-line

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (data) setProjects(data);
  }

  async function loadProducts() {
    const { data } = await supabase.from('products').select('*').order('created_at', { ascending: true });
    if (data) setProducts(data);
  }

  async function loadEffectiveSettings(projectId) {
    const { data: gd } = await supabase.from('settings').select('*').eq('id', 'global').maybeSingle();
    setGlobalSettings({ ...DEFAULT_SETTINGS, ...(gd ? parseRow(gd) : {}) });

    if (projectId) {
      const { data: pd } = await supabase.from('settings').select('*').eq('project_id', projectId).maybeSingle();
      const overrides = {};
      if (pd) {
        PROJECT_SETTINGS_KEYS.forEach(k => {
          if (pd[k] !== null && pd[k] !== undefined) {
            overrides[k] = STRING_KEYS.has(k) ? String(pd[k]) : Number(pd[k]);
          }
        });
      }
      setProjectOverrides(overrides);
    } else {
      setProjectOverrides({});
    }
  }

  async function saveGlobalSettings(data) {
    const { error } = await supabase.from('settings').upsert(
      { id: 'global', project_id: null, ...data }, { onConflict: 'id' }
    );
    if (error) { showToast('שגיאה: ' + error.message, 'error'); return false; }
    setGlobalSettings(g => ({ ...g, ...data }));
    showToast('הגדרות כלליות נשמרו');
    return true;
  }

  async function saveProjectSettings(overrides) {
    if (!activeProjectId) return false;
    const row = { id: activeProjectId, project_id: activeProjectId };
    PROJECT_SETTINGS_KEYS.forEach(k => {
      const val = overrides[k];
      if (val !== undefined && val !== '' && val !== null) {
        row[k] = STRING_KEYS.has(k) ? String(val) : Number(val);
      } else {
        row[k] = null;
      }
    });
    const { error } = await supabase.from('settings').upsert(row, { onConflict: 'id' });
    if (error) { showToast('שגיאה: ' + error.message, 'error'); return false; }
    const nonNull = {};
    PROJECT_SETTINGS_KEYS.forEach(k => { if (row[k] !== null) nonNull[k] = row[k]; });
    setProjectOverrides(nonNull);
    showToast('הגדרות פרויקט נשמרו');
    return true;
  }

  async function saveActualFreightQuote(amount) {
    if (!activeProjectId) { showToast('בחר פרויקט פעיל', 'error'); return false; }
    const n = Number(amount) || 0;
    const merged = { ...projectOverrides, actual_freight_usd: n > 0 ? n : null };
    const ok = await saveProjectSettings(merged);
    if (ok) {
      showToast(n > 0
        ? `🧾 ציטוט אמיתי נשמר: $${n.toLocaleString()}`
        : 'ציטוט אמיתי הוסר — חוזרים להערכה מ-FBX13');
    }
    return ok;
  }

  async function addProduct(product) {
    const { data, error } = await supabase.from('products')
      .insert([{ ...product, project_id: activeProjectId }]).select().single();
    if (error) { showToast('שגיאה בהוספת מוצר: ' + error.message, 'error'); return false; }
    setProducts(prev => [...prev, data]);
    showToast('מוצר נוסף בהצלחה');
    return true;
  }

  async function updateProduct(id, product) {
    const { error } = await supabase.from('products').update(product).eq('id', id);
    if (error) { showToast('שגיאה בעדכון מוצר', 'error'); return false; }
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...product } : p));
    showToast('מוצר עודכן');
    return true;
  }

  async function deleteProduct(id) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) { showToast('שגיאה במחיקה', 'error'); return false; }
    setProducts(prev => prev.filter(p => p.id !== id));
    showToast('מוצר נמחק');
    return true;
  }

  async function addFreightRecord(record) {
    const { data, error } = await supabase.from('freight_history').insert([record]).select().single();
    if (error) { showToast('שגיאה בהוספת Freight: ' + error.message, 'error'); return false; }
    setFreightHistory(prev => [data, ...prev]);
    if (data.freight_usd) setGlobalSettings(g => ({ ...g, freight: data.freight_usd }));
    showToast('Freight נוסף בהצלחה');
    return true;
  }

  async function addProducts(list) {
    const { data, error } = await supabase.from('products')
      .insert(list.map(p => ({ ...p, project_id: activeProjectId }))).select();
    if (error) { showToast('שגיאה בהוספת מוצרים: ' + error.message, 'error'); return false; }
    if (data) setProducts(prev => [...prev, ...data]);
    showToast(`${list.length} מוצרים נוספו בהצלחה`);
    return true;
  }

  async function deleteProject(id) {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) { showToast('שגיאה במחיקת פרויקט', 'error'); return false; }
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProjectId === id) setActiveProjectId(null);
    showToast('פרויקט נמחק');
    return true;
  }

  async function addProject(project) {
    const { data, error } = await supabase.from('projects').insert([project]).select().single();
    if (error) { showToast('שגיאה ביצירת פרויקט: ' + error.message, 'error'); return false; }
    setProjects(prev => [data, ...prev]);
    showToast('פרויקט נוצר בהצלחה');
    return data; // return the created project so callers can open it
  }

  async function updateProject(id, data) {
    const { error } = await supabase.from('projects').update(data).eq('id', id);
    if (error) { showToast('שגיאה בעדכון פרויקט', 'error'); return false; }
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    showToast('פרויקט עודכן');
    return true;
  }

  async function duplicateProject(sourceProj) {
    const { data: newProj, error } = await supabase.from('projects')
      .insert([{ name: sourceProj.name + ' (עותק)', supplier: sourceProj.supplier, status: 'draft', notes: sourceProj.notes }])
      .select().single();
    if (error) { showToast('שגיאה בשכפול', 'error'); return; }
    setProjects(prev => [newProj, ...prev]);
    const src = products.filter(p => p.project_id === sourceProj.id);
    if (src.length > 0) {
      const copies = src.map(({ id, created_at, project_id, ...rest }) => ({ ...rest, project_id: newProj.id }));
      const { data: copied, error: pe } = await supabase.from('products').insert(copies).select();
      if (pe) showToast('פרויקט שוכפל אך שגיאה בהעתקת מוצרים', 'error');
      else if (copied) setProducts(prev => [...prev, ...copied]);
    }
    showToast(`"${newProj.name}" שוכפל בהצלחה`);
  }

  async function applyShipmentInfo(shipment) {
    if (!activeProjectId) { showToast('בחר פרויקט פעיל', 'error'); return; }
    const updates = {};
    if (shipment.incoterms)   updates.incoterms   = shipment.incoterms;
    if (shipment.origin_port) {
      // Normalize AI-extracted port names ("Shanghai", "SHANGHAI", "上海")
      // so they match the Hebrew seed in container_pricing.
      const { normalizePort } = await import('./lib/containerSelection');
      updates.origin_port = normalizePort(shipment.origin_port);
    }
    const merged = { ...projectOverrides, ...updates };
    const ok = await saveProjectSettings(merged);
    if (ok) {
      const projUpdate = {};
      if (shipment.supplier)         projUpdate.supplier         = shipment.supplier;
      if (shipment.supplier_address) projUpdate.supplier_address = shipment.supplier_address;
      if (Object.keys(projUpdate).length) {
        const { error } = await supabase.from('projects').update(projUpdate).eq('id', activeProjectId);
        if (error && projUpdate.supplier_address) {
          // supplier_address column may not exist yet (migration 20260604 not run).
          // Fall back to persisting the supplier name alone so it isn't lost.
          delete projUpdate.supplier_address;
          if (projUpdate.supplier) await supabase.from('projects').update(projUpdate).eq('id', activeProjectId);
        }
        setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, ...projUpdate } : p));
      }
      showToast('פרטי המשלוח הוחלו על הפרויקט');
    }
  }

  async function updateMarketRate(parameter, value) {
    const ok = await saveMarketRate(supabase, parameter, value);
    if (ok) {
      setMarketRates(prev => prev.map(r =>
        r.parameter === parameter
          ? { ...r, value, updated_at: new Date().toISOString() }
          : r
      ));
      showToast(`שיעור שוק עודכן: $${value}`);
    } else {
      showToast('שגיאה בעדכון שיעור', 'error');
    }
  }

  async function applyMarketRate(key, value) {
    if (!activeProjectId) { showToast('בחר פרויקט פעיל', 'error'); return; }
    const merged = { ...projectOverrides, [key]: Number(value) };
    const ok = await saveProjectSettings(merged);
    if (ok) showToast(`שיעור $${value} הוחל על הפרויקט`);
  }

  const activeProject  = projects.find(p => p.id === activeProjectId) || null;
  const uniqueProducts = products.filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
  const activeProducts = activeProjectId ? uniqueProducts.filter(p => p.project_id === activeProjectId) : [];
  const calcCtx = useMemo(
    () => ({ containerTypes, pricing: containerPricing, projectId: activeProjectId }),
    [containerTypes, containerPricing, activeProjectId]
  );
  const shared = { products: activeProducts, settings, showToast, addProduct, updateProduct, deleteProduct, addProducts, applyShipmentInfo, calcCtx, saveActualFreightQuote };

  return (
    <Layout page={page} setPage={setPage} activeProject={activeProject}
      marketRates={marketRates} onUpdateMarketRate={updateMarketRate}
      onApplyMarketRate={applyMarketRate} settings={settings}>
      {page === 'dashboard'  && <Dashboard {...shared} allProducts={uniqueProducts} projects={projects}
                                  activeProjectId={activeProjectId} setActiveProjectId={setActiveProjectId} setPage={setPage} />}
      {page === 'advisor'    && <AdvisorPage {...shared} activeProject={activeProject} />}
      {page === 'products'   && <ProductsPage {...shared} activeProject={activeProject} setPage={setPage} />}
      {page === 'compliance' && <CompliancePage {...shared} activeProject={activeProject} setPage={setPage} />}
      {page === 'breakdown'  && <BreakdownPage {...shared} activeProject={activeProject} />}
      {page === 'finance'    && <FinancePage {...shared} activeProject={activeProject} />}
      {page === 'documents'  && <DocumentsPage activeProject={activeProject} activeProjectId={activeProjectId} showToast={showToast} applyShipmentInfo={applyShipmentInfo} />}
      {page === 'projects'   && <ProjectsPage projects={projects} products={products} settings={settings}
                                  addProject={addProject} updateProject={updateProject} duplicateProject={duplicateProject}
                                  deleteProject={deleteProject} calcCtx={calcCtx}
                                  setActiveProjectId={setActiveProjectId} setPage={setPage} showToast={showToast} />}
      {page === 'settings'   && <SettingsPage globalSettings={globalSettings} projectOverrides={projectOverrides}
                                  saveGlobalSettings={saveGlobalSettings} saveProjectSettings={saveProjectSettings}
                                  showToast={showToast} activeProject={activeProject} updateProject={updateProject}
                                  freightHistory={freightHistory} addFreightRecord={addFreightRecord}
                                  activeProjectId={activeProjectId} projects={projects}
                                  lastRateFetchAt={lastRateFetchAt}
                                  containerTypes={containerTypes} containerPricing={containerPricing}
                                  products={activeProducts} allProducts={uniqueProducts} marketRates={marketRates} />}

      <ConfirmDialogHost />
      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>
    </Layout>
  );
}
