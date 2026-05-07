import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import { DEFAULT_SETTINGS, PROJECT_SETTINGS_KEYS } from './lib/calculations';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ProductsPage from './components/ProductsPage';
import ProjectsPage from './components/ProjectsPage';
import SettingsPage from './components/SettingsPage';

// Merge global settings with sparse project overrides.
// Project values win only when non-null.
function mergeSettings(global, overrides) {
  const merged = { ...global };
  PROJECT_SETTINGS_KEYS.forEach(k => {
    if (overrides[k] !== null && overrides[k] !== undefined) merged[k] = Number(overrides[k]);
  });
  return merged;
}

function parseRow(data) {
  const s = {};
  Object.keys(DEFAULT_SETTINGS).forEach(k => {
    if (data[k] !== null && data[k] !== undefined) {
      s[k] = k === 'api_key' ? String(data[k]) : Number(data[k]);
    }
  });
  return s;
}

export default function App() {
  const [page, setPage]     = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [toasts, setToasts] = useState([]);

  // Two-level settings state
  const [globalSettings, setGlobalSettings]   = useState(DEFAULT_SETTINGS);
  const [projectOverrides, setProjectOverrides] = useState({}); // sparse — only overridden keys

  // Computed effective settings (used by all calculations)
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
    else localStorage.removeItem('lc_activeProjectId');
  }

  // ── Initial load ──
  useEffect(() => { loadProjects(); loadProducts(); }, []);
  useEffect(() => { loadEffectiveSettings(activeProjectId); }, [activeProjectId]); // eslint-disable-line
  useEffect(() => {
    if (activeProjectId && projects.length > 0) {
      if (!projects.find(p => p.id === activeProjectId)) setActiveProjectId(null);
    }
  }, [projects]); // eslint-disable-line

  // ── Realtime ──
  useEffect(() => {
    const prodCh = supabase.channel('products-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, payload => {
        if (payload.eventType === 'INSERT')       setProducts(prev => [...prev, payload.new]);
        else if (payload.eventType === 'UPDATE')  setProducts(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
        else if (payload.eventType === 'DELETE')  setProducts(prev => prev.filter(p => p.id !== payload.old.id));
      }).subscribe();

    const projCh = supabase.channel('projects-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, payload => {
        if (payload.eventType === 'INSERT')       setProjects(prev => [payload.new, ...prev]);
        else if (payload.eventType === 'UPDATE')  setProjects(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
        else if (payload.eventType === 'DELETE') {
          setProjects(prev => prev.filter(p => p.id !== payload.old.id));
          if (activeProjectIdRef.current === payload.old.id) setActiveProjectId(null);
        }
      }).subscribe();

    const settingsCh = supabase.channel('settings-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => {
        loadEffectiveSettings(activeProjectIdRef.current);
      }).subscribe();

    return () => {
      supabase.removeChannel(prodCh);
      supabase.removeChannel(projCh);
      supabase.removeChannel(settingsCh);
    };
  }, []); // eslint-disable-line

  // ── Data loaders ──
  async function loadProjects() {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (data) setProjects(data);
  }

  async function loadProducts() {
    const { data } = await supabase.from('products').select('*').order('created_at', { ascending: true });
    if (data) setProducts(data);
  }

  async function loadEffectiveSettings(projectId) {
    // Always load global row
    const { data: gd } = await supabase.from('settings').select('*').eq('id', 'global').maybeSingle();
    setGlobalSettings({ ...DEFAULT_SETTINGS, ...(gd ? parseRow(gd) : {}) });

    // Load project-specific overrides (only PROJECT_SETTINGS_KEYS)
    if (projectId) {
      const { data: pd } = await supabase.from('settings').select('*').eq('project_id', projectId).maybeSingle();
      const overrides = {};
      if (pd) {
        PROJECT_SETTINGS_KEYS.forEach(k => {
          if (pd[k] !== null && pd[k] !== undefined) overrides[k] = Number(pd[k]);
        });
      }
      setProjectOverrides(overrides);
    } else {
      setProjectOverrides({});
    }
  }

  // ── Settings CRUD (split by level) ──
  async function saveGlobalSettings(data) {
    const { error } = await supabase.from('settings').upsert(
      { id: 'global', project_id: null, ...data },
      { onConflict: 'id' }
    );
    if (error) { showToast('שגיאה: ' + error.message, 'error'); return false; }
    setGlobalSettings(g => ({ ...g, ...data }));
    showToast('הגדרות כלליות נשמרו');
    return true;
  }

  async function saveProjectSettings(overrides) {
    // overrides: sparse — only keys the project wants to override. Missing key = inherit global.
    if (!activeProjectId) return false;
    const row = { id: activeProjectId, project_id: activeProjectId };
    PROJECT_SETTINGS_KEYS.forEach(k => {
      row[k] = (overrides[k] !== undefined && overrides[k] !== '') ? Number(overrides[k]) : null;
    });
    const { error } = await supabase.from('settings').upsert(row, { onConflict: 'id' });
    if (error) { showToast('שגיאה: ' + error.message, 'error'); return false; }
    const nonNull = {};
    PROJECT_SETTINGS_KEYS.forEach(k => { if (row[k] !== null) nonNull[k] = row[k]; });
    setProjectOverrides(nonNull);
    showToast('הגדרות פרויקט נשמרו');
    return true;
  }

  // ── Products CRUD ──
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

  async function addProducts(list) {
    const { data, error } = await supabase.from('products')
      .insert(list.map(p => ({ ...p, project_id: activeProjectId }))).select();
    if (error) { showToast('שגיאה בהוספת מוצרים: ' + error.message, 'error'); return false; }
    if (data) setProducts(prev => [...prev, ...data]);
    showToast(`${list.length} מוצרים נוספו בהצלחה`);
    return true;
  }

  // ── Projects CRUD ──
  async function addProject(project) {
    const { data, error } = await supabase.from('projects').insert([project]).select().single();
    if (error) { showToast('שגיאה ביצירת פרויקט: ' + error.message, 'error'); return false; }
    setProjects(prev => [data, ...prev]);
    showToast('פרויקט נוצר בהצלחה');
    return true;
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
    if (error) { showToast('שגיאה בשכפול פרויקט', 'error'); return; }
    setProjects(prev => [newProj, ...prev]);

    const sourceProd = products.filter(p => p.project_id === sourceProj.id);
    if (sourceProd.length > 0) {
      const copies = sourceProd.map(({ id, created_at, project_id, ...rest }) => ({ ...rest, project_id: newProj.id }));
      const { data: copiedProds, error: pe } = await supabase.from('products').insert(copies).select();
      if (pe) showToast('פרויקט שוכפל אך שגיאה בהעתקת מוצרים', 'error');
      else if (copiedProds) setProducts(prev => [...prev, ...copiedProds]);
    }
    showToast(`"${newProj.name}" שוכפל בהצלחה`);
  }

  // ── Derived ──
  const activeProject  = projects.find(p => p.id === activeProjectId) || null;
  const activeProducts = activeProjectId ? products.filter(p => p.project_id === activeProjectId) : [];

  const sharedProduct = { products: activeProducts, settings, showToast, addProduct, updateProduct, deleteProduct, addProducts };

  return (
    <Layout page={page} setPage={setPage} activeProject={activeProject}>
      {page === 'dashboard' && (
        <Dashboard {...sharedProduct}
          allProducts={products} projects={projects}
          activeProjectId={activeProjectId} setActiveProjectId={setActiveProjectId} setPage={setPage}
        />
      )}
      {page === 'products' && (
        <ProductsPage {...sharedProduct} activeProject={activeProject} setPage={setPage} />
      )}
      {page === 'projects' && (
        <ProjectsPage
          projects={projects} products={products} settings={settings}
          addProject={addProject} updateProject={updateProject} duplicateProject={duplicateProject}
          setActiveProjectId={setActiveProjectId} setPage={setPage} showToast={showToast}
        />
      )}
      {page === 'settings' && (
        <SettingsPage
          globalSettings={globalSettings}
          projectOverrides={projectOverrides}
          saveGlobalSettings={saveGlobalSettings}
          saveProjectSettings={saveProjectSettings}
          showToast={showToast}
          activeProject={activeProject}
          updateProject={updateProject}
        />
      )}

      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>
    </Layout>
  );
}
