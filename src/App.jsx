import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, LogOut, MapPin, Moon, PanelLeftClose, PanelLeftOpen, Sun, Trash2, Users as UsersIcon } from 'lucide-react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import { downloadReportCsv, downloadReportXlsx } from './reportExport.js'

const API = 'http://localhost:5000/api'
const CONNECTION_ERROR = 'Unable to reach the server right now. Please check your connection and try again.'
const SIZES = ['small', 'medium', 'large']
const FRUIT_NAMES = ['Apples', 'Bananas', 'Oranges', 'Mangoes', 'Grapes']
const LOCATIONS = ['Maseru Central', 'Pitso Ground', 'Ha Tsosane', 'Sea Point', 'Qoaling']
const PROVINCES = ['Gauteng', 'Free State', 'KwaZulu-Natal', 'Western Cape', 'Eastern Cape', 'Limpopo', 'Mpumalanga', 'North West']
const PAYMENT_METHODS = ['Cash', 'Mobile money', 'Outstanding']

async function api(path, token, options = {}) {
  let response
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error(CONNECTION_ERROR)
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.message || 'We could not complete that request. Please try again.')
    error.status = response.status
    throw error
  }
  return result
}

function query(values) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value !== undefined && value !== null) params.set(key, value)
  })
  const text = params.toString()
  return text ? `?${text}` : ''
}

function money(value) {
  return `M ${Number(value || 0).toLocaleString('en-LS', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function dateText(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function sanitizePhoneNumber(value) {
  return value.replace(/[^0-9+ ]/g, '').replace(/ {2,}/g, ' ').slice(0, 30)
}

function today() {
  return new Date().toLocaleDateString('en-CA')
}

function activateRowOnKeyDown(event, onActivate) {
  if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    onActivate(event)
  }
}

function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

function PageError({ message, onRetry }) {
  return (
    <div className="page-error">
      <div className="error-mark">!</div>
      <p className="eyebrow">We couldn’t load this screen</p>
      <h2>Let’s try that again</h2>
      <p>{message || CONNECTION_ERROR}</p>
      <button className="button primary" onClick={onRetry}>Try Again</button>
    </div>
  )
}

function EmptyState({ title, text, action, onAction }) {
  return <div className="empty-state"><span className="empty-icon">↗</span><h3>{title}</h3><p>{text}</p>{action && <button className="button secondary" onClick={onAction}>{action}</button>}</div>
}

function Skeleton() {
  return <div className="skeleton-list" aria-label="Loading records">{[0, 1, 2, 3].map((item) => <div className="skeleton-row" key={item}><i /><i /><i /></div>)}</div>
}

function Status({ status }) {
  const labels = {
    IN_STOCK: 'In stock', LOW_STOCK: 'Low stock', OUT_OF_STOCK: 'Out of stock',
    PAID: 'Paid', PARTIALLY_PAID: 'Partially paid', UNPAID: 'Unpaid',
    active: 'Active', inactive: 'Inactive',
  }
  return <span className={`status status-${String(status || '').toLowerCase()}`}>{labels[status] || status}</span>
}

function Pagination({ info, onPage, label = 'records' }) {
  if (!info || info.totalPages <= 1) return null
  return (
    <div className="pagination">
      <span>Page <b className="numeric">{info.page}</b> of <b className="numeric">{info.totalPages}</b> <span className="muted">· {info.totalItems} {label}</span></span>
      <div><button className="button secondary small-button" disabled={info.page <= 1} onClick={() => onPage(info.page - 1)}>Previous</button><button className="button secondary small-button" disabled={info.page >= info.totalPages} onClick={() => onPage(info.page + 1)}>Next</button></div>
    </div>
  )
}

function App() {
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('batloung-theme')
    return savedTheme === 'dark' || savedTheme === 'light'
      ? savedTheme
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [token, setToken] = useState(() => localStorage.getItem('batloung-token') || '')
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(Boolean(localStorage.getItem('batloung-token')))
  const [authVersion, setAuthVersion] = useState(0)
  const [authError, setAuthError] = useState('')
  const [authErrorRetryable, setAuthErrorRetryable] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [screen, setScreen] = useState('stock')
  const [payload, setPayload] = useState(null)
  const [loadStatus, setLoadStatus] = useState({ key: '', error: '' })
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [drawer, setDrawer] = useState(null)
  const [modal, setModal] = useState(null)
  const [stockModalDirty, setStockModalDirty] = useState(false)
  const [confirmStockDiscard, setConfirmStockDiscard] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('batloung-sidebar-collapsed') === 'true')
  const returnFocus = useRef(null)
  const modalReturnFocus = useRef(null)
  const drawerRef = useRef(null)
  const modalRef = useRef(null)
  const isAdmin = user?.role === 'admin'
  const [stockFilters, setStockFilters] = useState({ search: '', packagingSize: '', stockStatus: '', minPrice: '', maxPrice: '' })
  const [stockPage, setStockPage] = useState(1)
  const [saleFilters, setSaleFilters] = useState({ search: '', paymentStatus: '', dateFrom: '', dateTo: '' })
  const [vendorFilters, setVendorFilters] = useState({ search: '', location: '' })
  const [supplierFilters, setSupplierFilters] = useState({ search: '' })
  const [userFilters, setUserFilters] = useState({ search: '' })
  const [salePage, setSalePage] = useState(1)
  const [purchasePage, setPurchasePage] = useState(1)
  const [vendorPage, setVendorPage] = useState(1)
  const [supplierPage, setSupplierPage] = useState(1)
  const [userPage, setUserPage] = useState(1)
  const [reportDates, setReportDates] = useState(() => {
    const date = today()
    return { startDate: `${date.slice(0, 7)}-01`, endDate: date }
  })
  const loadKey = JSON.stringify([
    user?.userId, authVersion, screen, isAdmin, refreshVersion,
    stockFilters.search, stockFilters.packagingSize, stockFilters.stockStatus, stockFilters.minPrice, stockFilters.maxPrice, stockPage,
    saleFilters, salePage, purchasePage, vendorFilters, vendorPage, supplierFilters, supplierPage, userFilters, userPage, reportDates,
  ])
  const loading = Boolean(user && loadStatus.key !== loadKey)
  const loadError = loadStatus.key === loadKey ? loadStatus.error : ''
  const drawerFocusKey = drawer
    ? [drawer.type, drawer.mode, drawer.vendor?.vendorId, drawer.supplier?.supplierId, drawer.user?.userId, drawer.saleId, drawer.purchaseId, drawer.payments].join('|')
    : ''

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const retryAuth = useCallback(async () => {
    const savedToken = localStorage.getItem('batloung-token')
    if (!savedToken) {
      setAuthError('')
      setAuthErrorRetryable(false)
      try {
        const response = await fetch(`${API}/health`)
        if (!response.ok) throw new Error(CONNECTION_ERROR)
      } catch {
        setAuthError(CONNECTION_ERROR)
        setAuthErrorRetryable(true)
      } finally {
        setAuthLoading(false)
        setToken('')
        setUser(null)
      }
      return
    }
    setAuthLoading(true)
    setAuthError('')
    setAuthErrorRetryable(false)
    try {
      const result = await api('/auth/me', savedToken)
      setToken(savedToken)
      setUser(result.user)
    } catch (error) {
      if (error.status === 401) {
        localStorage.removeItem('batloung-token')
        setToken('')
        setUser(null)
      } else {
        setAuthError(CONNECTION_ERROR)
        setAuthErrorRetryable(true)
      }
    } finally {
      setAuthLoading(false)
    }
  }, [])

  useEffect(() => { retryAuth() }, [retryAuth])

  useEffect(() => {
    if (user?.role === 'sales' && ['purchases', 'suppliers', 'users'].includes(screen)) setScreen('stock')
  }, [user, screen])

  useEffect(() => {
    if (!user || !token) return
    let active = true
    const load = async () => {
      try {
        let result
        if (screen === 'stock') {
          const [stock, fruits] = await Promise.all([
            api(`/stock${query({ ...stockFilters, groupByFruit: true, page: stockPage, limit: 10 })}`, token),
            api('/fruits?limit=100', token),
          ])
          result = { stock, fruits }
        } else if (screen === 'sales') {
          const [sales, vendors, stock] = await Promise.all([
            api(`/sales${query({ ...saleFilters, page: salePage, limit: 8 })}`, token),
            api('/vendors?limit=100', token),
            api('/stock?limit=100', token),
          ])
          result = { sales, vendors, stock }
        } else if (screen === 'purchases') {
          if (!isAdmin) {
            result = { restricted: true }
          } else {
            const [purchases, suppliers, fruits] = await Promise.all([
              api(`/purchases${query({ page: purchasePage, limit: 8 })}`, token),
              api('/suppliers?limit=100', token),
              api('/fruits?status=active&limit=100', token),
            ])
            result = { purchases, suppliers, fruits }
          }
        } else if (screen === 'vendors') {
          const vendors = await api(`/vendors${query({ ...vendorFilters, page: vendorPage, limit: 10 })}`, token)
          result = { vendors }
        } else if (screen === 'reports') {
          const [topFruits, revenue, topVendor, stockLevels] = await Promise.all([
            api('/reports/top-fruits', token),
            api(`/reports/revenue${query(reportDates)}`, token),
            api('/reports/top-vendor', token),
            api('/reports/stock-levels', token),
          ])
          result = { topFruits, revenue, topVendor, stockLevels }
        } else if (screen === 'suppliers') {
          if (!isAdmin) {
            result = { restricted: true }
          } else {
            const suppliers = await api(`/suppliers${query({ ...supplierFilters, page: supplierPage, limit: 10 })}`, token)
            result = { suppliers }
          }
        } else if (screen === 'users') {
          if (!isAdmin) {
            result = { restricted: true }
          } else {
            const users = await api(`/users${query({ ...userFilters, page: userPage, limit: 10 })}`, token)
            result = { users }
          }
        }
        if (active) {
          setPayload(result)
          setLoadStatus({ key: loadKey, error: '' })
        }
      } catch (error) {
        if (error.status === 401) {
          localStorage.removeItem('batloung-token')
          setToken('')
          setUser(null)
        } else if (active) {
          setLoadStatus({ key: loadKey, error: error.status === 403
            ? 'Your account does not have permission to view this information. Sign in with an admin account for purchase and supplier records.'
            : error.status && error.status < 500 ? error.message : CONNECTION_ERROR })
        }
      }
    }
    load()
    return () => { active = false }
  }, [user, token, screen, isAdmin, authVersion, refreshVersion, stockFilters, stockPage, saleFilters, salePage, purchasePage, vendorFilters, vendorPage, supplierFilters, supplierPage, userFilters, userPage, reportDates, loadKey])

  useEffect(() => {
    if (drawerFocusKey && drawerRef.current) {
      drawerRef.current.querySelector('input, select, textarea, button')?.focus()
    }
  }, [drawerFocusKey])

  useEffect(() => {
    if (modal) modalRef.current?.querySelector('button')?.focus()
  }, [modal])

  const dismissDrawer = useCallback(() => {
    if (!drawer) return
    if (drawer.dirty) {
      modalReturnFocus.current = document.activeElement
      setModal({ type: 'discard' })
      return
    }
    setDrawer(null)
    setActionError('')
    window.setTimeout(() => returnFocus.current?.focus(), 0)
  }, [drawer])

  const closeModal = useCallback((force = false) => {
    if (!force && modal?.type === 'stockItem' && stockModalDirty) {
      setConfirmStockDiscard(true)
      return
    }
    setModal(null)
    setStockModalDirty(false)
    setConfirmStockDiscard(false)
    window.setTimeout(() => {
      if (modalReturnFocus.current?.isConnected) modalReturnFocus.current.focus()
      else drawerRef.current?.querySelector('.drawer-close')?.focus()
    }, 0)
  }, [modal, stockModalDirty])

  useEffect(() => {
    if (!drawer && !modal) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (modal) closeModal()
        else dismissDrawer()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawer, modal, dismissDrawer, closeModal])

  const openDrawer = (details, event) => {
    if (!drawer) returnFocus.current = event?.currentTarget || document.activeElement
    setActionError('')
    setDrawer({ ...details, dirty: false })
  }
  const markDrawerDirty = useCallback((dirty) => {
    setDrawer((current) => current && current.dirty !== dirty ? { ...current, dirty } : current)
  }, [])
  const refresh = () => setRefreshVersion((value) => value + 1)
  const closeDrawerAfterSave = (message = 'Changes saved to the farm ledger.') => {
    setDrawer(null)
    setModal(null)
    setActionError('')
    setNotice(message)
    window.setTimeout(() => returnFocus.current?.focus(), 0)
    refresh()
  }
  const signOut = () => {
    localStorage.removeItem('batloung-token')
    setToken('')
    setUser(null)
    setPayload(null)
    setScreen('stock')
    setAuthVersion((value) => value + 1)
  }

  const requestSignOut = (event) => {
    modalReturnFocus.current = event.currentTarget
    setModal({ type: 'logout' })
  }

  const openStockItemModal = (item, event) => {
    modalReturnFocus.current = event.currentTarget
    setActionError('')
    setStockModalDirty(false)
    setConfirmStockDiscard(false)
    setModal({ type: 'stockItem', item })
  }

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed
      localStorage.setItem('batloung-sidebar-collapsed', String(next))
      return next
    })
  }

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('batloung-theme', nextTheme)
    setTheme(nextTheme)
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthErrorRetryable(false)
    const form = new FormData(event.currentTarget)
    try {
      const result = await api('/auth/login', '', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) })
      localStorage.setItem('batloung-token', result.token)
      setToken(result.token)
      setUser(result.user)
      setAuthVersion((value) => value + 1)
      setNotice(`Welcome back, ${result.user.fullName}.`)
    } catch (error) {
      const isConnectionError = !error.status || error.status >= 500
      setAuthError(isConnectionError
        ? CONNECTION_ERROR
        : error.message)
      setAuthErrorRetryable(isConnectionError)
    }
  }

  const handleActionError = useCallback((error, restrictedMessage) => {
    setActionError(error.status === 403 ? restrictedMessage || 'Admin access is required for this action.' : error.message)
  }, [])

  const filteredStock = (payload?.stock?.items || []).filter((item) => {
    const price = Number(item.unitSellingPrice)
    const minPrice = stockFilters.minPrice === '' ? null : Number(stockFilters.minPrice)
    const maxPrice = stockFilters.maxPrice === '' ? null : Number(stockFilters.maxPrice)
    const matchesSearch = String(item.fruitName || '').toLowerCase().includes(stockFilters.search.trim().toLowerCase())
    const matchesSize = !stockFilters.packagingSize || item.packagingSize === stockFilters.packagingSize
    const matchesStatus = !stockFilters.stockStatus
      || (stockFilters.stockStatus === 'available' && item.stockStatus === 'IN_STOCK')
      || (stockFilters.stockStatus === 'low' && item.stockStatus !== 'IN_STOCK')
      || (stockFilters.stockStatus === 'out' && item.stockStatus === 'OUT_OF_STOCK')
    return matchesSearch && matchesSize && matchesStatus
      && (stockFilters.minPrice === '' || !Number.isFinite(minPrice) || price >= minPrice)
      && (stockFilters.maxPrice === '' || !Number.isFinite(maxPrice) || price <= maxPrice)
  })
  const stockGroups = filteredStock.reduce((groups, item) => {
    let group = groups.find((entry) => entry.fruitId === item.fruitId)
    if (!group) {
      group = { fruitId: item.fruitId, fruitName: item.fruitName, fruitStatus: item.fruitStatus, items: [] }
      groups.push(group)
    }
    group.items.push(item)
    return groups
  }, [])
  const stockCount = filteredStock.reduce((sum, item) => sum + Number(item.availableQuantity), 0)
  const lowCount = filteredStock.filter((item) => item.stockStatus !== 'IN_STOCK').length
  const updateStockFilters = (changes) => {
    setStockFilters((current) => ({ ...current, ...changes }))
    setStockPage(1)
  }
  const clearStockFilters = () => updateStockFilters({ search: '', packagingSize: '', stockStatus: '', minPrice: '', maxPrice: '' })
  const hasStockFilters = Object.values(stockFilters).some(Boolean)

  if (authLoading) return <div className="auth-page"><div className="auth-card"><div className="brand-mark">BF</div><p className="eyebrow">Batloung Farm</p><h1>Opening the ledger…</h1><div className="loader" /></div></div>
  if (!user) {
    return (
      <div className="auth-page">
        <form className="auth-card" onSubmit={handleLogin}>
          <div className="brand-mark">BF</div>
          <p className="eyebrow">Batloung Farm · Maseru</p>
          <h1>Welcome to the ledger</h1>
          <p className="muted">Sign in to manage fresh produce, vendor sales, and stock.</p>
          {authError && <div className="inline-alert" role="alert">{authError}{authErrorRetryable && <button type="button" className="text-button" onClick={retryAuth}>Try connection again</button>}</div>}
          <Field label="Username"><input name="username" autoComplete="username" required /></Field>
          <div className="field password-field">
            <label htmlFor="login-password">Password</label>
            <div className="password-control">
              <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required />
              <button type="button" className="password-toggle" aria-controls="login-password" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          <button className="button primary full-button" type="submit">Sign in</button>
          <p className="auth-footnote">Need access? Ask an administrator to set up your account.</p>
        </form>
      </div>
    )
  }

  const nav = [
    { id: 'stock', label: 'Stock', icon: '▦' },
    { id: 'sales', label: 'Sales', icon: '↗' },
    ...(isAdmin ? [{ id: 'purchases', label: 'Purchases', icon: '↙' }] : []),
    ...(isAdmin ? [{ id: 'suppliers', label: 'Suppliers', icon: '♧' }] : []),
    ...(isAdmin ? [{ id: 'users', label: 'Users', icon: <UsersIcon size={16} aria-hidden="true" /> }] : []),
    { id: 'vendors', label: 'Vendors', icon: '◎' },
    { id: 'reports', label: 'Reports', icon: '▤' },
  ]
  const screenTitle = { stock: 'Stock ledger', sales: 'Sales', purchases: 'Purchases', suppliers: 'Suppliers', users: 'Users', vendors: 'Vendors', reports: 'Reports' }[screen]

  const currentView = () => {
    if (loading && !(screen === 'stock' && payload?.fruits?.items)) return <Skeleton />
    if (loadError && !(screen === 'stock' && payload?.fruits?.items)) return <PageError message={loadError} onRetry={refresh} />
    if (!payload) return <Skeleton />
    if (screen === 'stock') {
      return (
        <>
          <div className="metric-row">
            <div className="metric-card"><span>Boxes in view</span><strong className="numeric">{stockCount.toLocaleString()}</strong><small>Across {filteredStock.length} packaging records</small></div>
            <div className="metric-card"><span>Needs attention</span><strong className="numeric">{lowCount.toLocaleString()}</strong><small>Low or out-of-stock records</small></div>
            <div className="metric-card"><span>Fruit varieties</span><strong className="numeric">{payload.fruits.items?.length || 0}</strong><small>Registered in the ledger</small></div>
          </div>
          <section className="panel" aria-busy={loading}>
            {loading && <p className="stock-loading" role="status">Updating stock…</p>}
            {loadError && <p className="form-error stock-load-error" role="alert">{loadError} <button type="button" className="text-button" onClick={refresh}>Try again</button></p>}
            <div className="panel-heading"><div><p className="eyebrow">On hand</p><h2>Packaging-level stock</h2></div><div className="filters">
              <input aria-label="Search fruit" placeholder="Search fruit…" value={stockFilters.search} onChange={(event) => updateStockFilters({ search: event.target.value })} />
              <select aria-label="Filter packaging" value={stockFilters.packagingSize} onChange={(event) => updateStockFilters({ packagingSize: event.target.value })}><option value="">All sizes</option>{SIZES.map((size) => <option key={size}>{size}</option>)}</select>
              <select aria-label="Filter stock status" value={stockFilters.stockStatus} onChange={(event) => updateStockFilters({ stockStatus: event.target.value })}><option value="">All stock status</option><option value="available">Available</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
              <Field label="Min price (M)" hint="Inclusive lower limit"><input className="numeric" type="number" min="0" step="0.01" aria-label="Minimum price per box in Maloti, inclusive" placeholder="e.g. 10.00" value={stockFilters.minPrice} onChange={(event) => updateStockFilters({ minPrice: event.target.value })} /></Field>
              <Field label="Max price (M)" hint="Inclusive upper limit"><input className="numeric" type="number" min="0" step="0.01" aria-label="Maximum price per box in Maloti, inclusive" placeholder="e.g. 50.00" value={stockFilters.maxPrice} onChange={(event) => updateStockFilters({ maxPrice: event.target.value })} /></Field>
              <button className="button secondary small-button" disabled={!hasStockFilters} onClick={clearStockFilters}>Reset filters</button>
            </div></div>
            {stockGroups.length ? <div className="table-scroll"><table><thead><tr><th>Fruit</th><th>Packaging</th><th className="align-right">Boxes available</th><th className="align-right">Price / box</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              {stockGroups.map((group) => <tbody key={group.fruitId}>
                <tr className="stock-fruit-group"><th scope="rowgroup" colSpan="6"><strong>{group.fruitName}</strong>{group.fruitStatus !== 'active' && <small className="row-sub">Inactive fruit</small>}<small className="row-sub">{group.items.length} packaging {group.items.length === 1 ? 'size' : 'sizes'}</small></th></tr>
                {group.items.map((item) => <tr
                  key={item.stockId}
                  className={isAdmin ? 'stock-item-row' : undefined}
                  role={isAdmin ? 'button' : undefined}
                  tabIndex={isAdmin ? 0 : undefined}
                  aria-label={isAdmin ? `Edit or delete ${item.packagingSize} ${item.fruitName} stock item` : undefined}
                  onClick={isAdmin ? (event) => openStockItemModal(item, event) : undefined}
                  onKeyDown={isAdmin ? (event) => {
                    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault()
                      openStockItemModal(item, event)
                    }
                  } : undefined}
                ><td><span className="sr-only">{item.fruitName}</span></td><td className="capitalize">{item.packagingSize}</td><td className="numeric align-right">{Number(item.availableQuantity).toLocaleString()}</td><td className="numeric align-right">{money(item.unitSellingPrice)}</td><td><Status status={item.stockStatus} /></td><td className="align-right">{isAdmin && <button className="text-button" onClick={(event) => { event.stopPropagation(); openStockItemModal(item, event) }}>Edit</button>}</td></tr>)}
              </tbody>)}</table></div> : <EmptyState title="No stock matches those filters" text="Try resetting a filter, or record a purchase to bring produce into the ledger." action="Reset filters" onAction={clearStockFilters} />}
            <Pagination info={payload.stock.pagination} onPage={setStockPage} label="fruit groups" />
          </section>
          {!isAdmin && <div className="helper-strip"><span>Sales access</span><span>Fruit registration and stock editing require an admin account.</span></div>}
        </>
      )
    }
    if (screen === 'sales') return <SalesScreen data={payload} token={token} filters={saleFilters} setFilters={(value) => { setSaleFilters(value); setSalePage(1) }} setPage={setSalePage} onOpen={(sale, event) => openDrawer({ type: 'sale', saleId: sale.saleId, sale }, event)} onSubmitError={handleActionError} onDone={(message) => { setNotice(message); refresh() }} />
    if (screen === 'purchases') {
      if (payload.restricted) return <Restricted title="Purchases are an admin responsibility" text="Your sales role can view stock, vendors, reports, and record sales. Ask an administrator to record or review supplier purchases." />
      return <PurchasesScreen data={payload} token={token} setPage={setPurchasePage} onManageSuppliers={() => { setNotice(''); setScreen('suppliers') }} onPurchaseError={handleActionError} onDone={(message) => { setNotice(message); refresh() }} onPurchaseOpen={(purchase, event) => openDrawer({ type: 'purchase', purchaseId: purchase.purchaseId }, event)} />
    }
    if (screen === 'vendors') return <VendorsScreen data={payload} filters={vendorFilters} setFilters={(value) => { setVendorFilters(value); setVendorPage(1) }} setPage={setVendorPage} onVendorOpen={(vendor, event) => openDrawer({ type: 'vendor', vendor }, event)} />
    if (screen === 'reports') return <ReportsScreen data={payload} reportDates={reportDates} setReportDates={setReportDates} />
    if (screen === 'users') {
      if (payload.restricted) return <Restricted title="Users are an admin responsibility" text="Only an administrator can create accounts or manage user access." />
      return <UsersScreen data={payload} filters={userFilters} setFilters={(value) => { setUserFilters(value); setUserPage(1) }} setPage={setUserPage} currentUser={user} onEdit={(account, event) => openDrawer({ type: 'user', mode: 'edit', user: account }, event)} />
    }
    if (screen === 'suppliers') {
      if (payload.restricted) return <Restricted title="Suppliers are an admin responsibility" text="Supplier records contain purchasing contacts and can only be viewed and managed by an administrator." />
      return <SuppliersScreen data={payload} filters={supplierFilters} setFilters={(value) => { setSupplierFilters(value); setSupplierPage(1) }} setPage={setSupplierPage} onEdit={(supplier, event) => openDrawer({ type: 'supplier', mode: 'edit', supplier }, event)} onDelete={(supplier, event) => { modalReturnFocus.current = event.currentTarget; setActionError(''); setModal({ type: 'deleteSupplier', supplier }) }} />
    }
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="sidebar" aria-label="Workspace sidebar">
        <div className="sidebar-header">
          <a href="#" className="brand" onClick={(event) => { event.preventDefault(); setScreen('stock') }}><span className="brand-mark">BF</span><span className="brand-copy"><b>Batloung Farm</b><small>Market ledger · Maseru</small></span></a>
          <button type="button" className="sidebar-toggle" onClick={toggleSidebar} aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {sidebarCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          </button>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Main navigation">{nav.map((item) => <button type="button" key={item.id} className={`nav-link ${screen === item.id ? 'active' : ''}`} onClick={() => { setScreen(item.id); setNotice('') }} title={sidebarCollapsed ? item.label : undefined} aria-label={sidebarCollapsed ? item.label : undefined} aria-current={screen === item.id ? 'page' : undefined}><span className="nav-icon">{item.icon}</span><span className="nav-label">{item.label}</span></button>)}</nav>
        <div className="sidebar-note"><span className="note-dot" /><span><b>Fresh from the farm</b><small>Keeping Maseru supplied, one crate at a time.</small></span></div>
        <div className="sidebar-account">
          <div className="sidebar-account-summary">
            <span className="avatar">{(user.fullName || user.username).slice(0, 1).toUpperCase()}</span>
            <div className="user-copy"><b>{user.fullName || user.username}</b><span>{user.role === 'admin' ? 'Administrator' : 'Sales team'}</span></div>
          </div>
          <button type="button" className="button secondary signout" onClick={requestSignOut} title={sidebarCollapsed ? 'Sign out' : undefined} aria-label={sidebarCollapsed ? 'Sign out' : undefined}><LogOut aria-hidden="true" /><span className="signout-label">Sign out</span></button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <b className="topbar-title">{screenTitle}</b>
          <button type="button" className="button secondary theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </header>
        <div className="content">
          <div className="screen-heading"><div><h1>{screenTitle}</h1><p className="screen-description">{screen === 'stock' ? 'A clear view of every box, size, and selling price.' : screen === 'sales' ? 'Build vendor orders and keep every payment accounted for.' : screen === 'purchases' ? 'Replenish the orchard and keep supplier records close.' : screen === 'suppliers' ? 'Manage the businesses that supply produce to the farm.' : screen === 'users' ? 'Create accounts and control access to the farm ledger.' : screen === 'reports' ? 'Focused views of sales, revenue, vendors, and stock.' : screen === 'vendors' ? 'Know the people and places that keep Maseru supplied.' : ''}</p></div>
            {screen === 'stock' && <div className="heading-actions">{isAdmin && <button className="button secondary" onClick={(event) => openDrawer({ type: 'fruit', mode: 'create' }, event)}>+ Register fruit</button>}<button className="button primary" onClick={() => setScreen('sales')}>+ Record Sale</button></div>}
            {screen === 'vendors' && <button className="button primary" onClick={(event) => openDrawer({ type: 'vendor', mode: 'create' }, event)}>+ Add Vendor</button>}
            {screen === 'suppliers' && isAdmin && <button className="button primary" onClick={(event) => openDrawer({ type: 'supplier', mode: 'create' }, event)}>+ Add Supplier</button>}
            {screen === 'users' && isAdmin && <button className="button primary" onClick={(event) => openDrawer({ type: 'user', mode: 'create' }, event)}>+ Add User</button>}
          </div>
          {notice && <div className="success-banner" role="status"><span>✓</span>{notice}<button className="banner-close" onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
          {currentView()}
        </div>
      </main>
      {drawer && <div className="drawer-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) dismissDrawer() }}>
        <section className="drawer" ref={drawerRef} role="dialog" aria-label="Details panel">
          <button className="drawer-close" aria-label="Close panel" onClick={dismissDrawer}>×</button>
          {actionError && <p className="form-error drawer-global-error" role="alert">{actionError}</p>}
          {drawer.type === 'fruit' && <FruitDrawer drawer={drawer} token={token} onDirty={markDrawerDirty} onError={handleActionError} onDone={closeDrawerAfterSave} />}
          {drawer.type === 'sale' && <SaleDrawer drawer={drawer} token={token} onDirty={markDrawerDirty} onError={handleActionError} onDone={closeDrawerAfterSave} />}
          {drawer.type === 'supplier' && <SupplierFormDrawer drawer={drawer} token={token} onDirty={markDrawerDirty} onError={handleActionError} onDone={closeDrawerAfterSave} />}
          {drawer.type === 'user' && <UserDrawer drawer={drawer} token={token} currentUser={user} onDirty={markDrawerDirty} onDone={(message, updatedUser) => {
            if (updatedUser?.userId === user.userId) setUser((current) => ({ ...current, ...updatedUser }))
            closeDrawerAfterSave(message)
          }} />}
          {drawer.type === 'vendor' && <VendorDrawer drawer={drawer} token={token} onDirty={markDrawerDirty} onError={handleActionError} onDone={closeDrawerAfterSave} onPayment={(sale, event) => openDrawer({ type: 'sale', saleId: sale.saleId, sale }, event)} onManagePayments={(vendor, event) => openDrawer({ type: 'vendor', vendor, payments: true }, event)} />}
          {drawer.type === 'purchase' && <PurchaseDrawer drawer={drawer} token={token} />}
        </section>
      </div>}
      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal() }}><section className={`confirm-modal${modal.type === 'logout' ? ' logout-confirmation' : ''}`} ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="confirmation-title">
        <button className="drawer-close" aria-label="Close dialog" onClick={closeModal}>×</button>
        <span className="modal-icon">{modal.type === 'logout' || modal.type === 'discard' || confirmStockDiscard ? '!' : '×'}</span>
        <p className="eyebrow">{modal.type === 'logout' ? 'Session' : modal.type === 'discard' || confirmStockDiscard ? 'Unsaved changes' : modal.type === 'stockItem' ? 'Packaging stock' : 'Supplier record'}</p>
        <h2 id="confirmation-title">{modal.type === 'logout' ? 'Sign out of Batloung Farm?' : modal.type === 'discard' ? 'Discard this work?' : confirmStockDiscard ? 'Discard stock changes?' : modal.type === 'stockItem' ? `${modal.item.packagingSize} ${modal.item.fruitName}` : `Delete ${modal.supplier.businessName}?`}</h2>
        <p>{modal.type === 'logout' ? 'You will need to sign in again to continue.' : modal.type === 'discard' ? 'Your changes will be lost if you leave this form.' : confirmStockDiscard ? 'Your stock quantity and price changes will be lost.' : modal.type === 'stockItem' ? 'Update available boxes or the selling price, or remove this packaging record if it has no purchase or sales history.' : 'This cannot be undone. Suppliers with recorded purchases cannot be removed.'}</p>
        {modal.type === 'logout'
          ? <div className="modal-actions"><button className="button secondary" onClick={closeModal}>Cancel</button><button className="button secondary" onClick={signOut}>Sign out</button></div>
          : modal.type === 'discard'
          ? <div className="modal-actions"><button className="button secondary" onClick={closeModal}>Keep editing</button><button className="button secondary" onClick={() => { setModal(null); setDrawer(null); window.setTimeout(() => returnFocus.current?.focus(), 0) }}>Discard changes</button></div>
          : modal.type === 'stockItem'
          ? <StockItemModal item={modal.item} token={token} confirmDiscard={confirmStockDiscard} onDirty={() => setStockModalDirty(true)} onKeepEditing={() => setConfirmStockDiscard(false)} onDiscard={() => closeModal(true)} onCancel={closeModal} onError={setActionError} onDone={(message, deleted = false) => {
            if (deleted) modalReturnFocus.current = document.querySelector('[aria-label="Search fruit"]')
            closeModal(true)
            setActionError('')
            setNotice(message)
            refresh()
          }} />
          : <DeleteSupplierModal supplier={modal.supplier} token={token} onCancel={closeModal} onError={(message) => setActionError(message)} onDone={() => { setSupplierPage(1); modalReturnFocus.current = document.querySelector('[aria-label="Search suppliers"]'); closeModal(); setActionError(''); setNotice('Supplier deleted from the ledger.'); refresh() }} />}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
      </section></div>}
    </div>
  )
}

function Restricted({ title, text }) {
  return <div className="restricted-card"><span className="lock-large">⌑</span><div><p className="eyebrow">Role-based access</p><h2>{title}</h2><p>{text}</p></div></div>
}

function SalesScreen({ data, token, filters, setFilters, setPage, onOpen, onSubmitError, onDone }) {
  const [lines, setLines] = useState([{ fruitId: '', packagingSize: 'small', quantity: 1 }])
  const [vendorId, setVendorId] = useState('')
  const [saleDate, setSaleDate] = useState(today())
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const stock = data.stock.items || []
  const vendors = data.vendors.items || []
  const total = lines.reduce((sum, line) => {
    const record = stock.find((item) => item.fruitId === Number(line.fruitId) && item.packagingSize === line.packagingSize)
    return sum + (record ? Number(record.unitSellingPrice) * Number(line.quantity || 0) : 0)
  }, 0)
  const invalidLine = lines.some((line) => {
    const record = stock.find((item) => item.fruitId === Number(line.fruitId) && item.packagingSize === line.packagingSize)
    return !line.fruitId || Number(line.quantity) < 1 || !record || Number(line.quantity) > Number(record.availableQuantity)
  })
  const quantityAboveStock = lines.some((line) => {
    const record = stock.find((item) => item.fruitId === Number(line.fruitId) && item.packagingSize === line.packagingSize)
    return Boolean(line.fruitId) && Number(line.quantity) > Number(record?.availableQuantity || 0)
  })
  const updateLine = (index, key, value) => {
    setError('')
    setLines((previous) => previous.map((line, i) => i === index ? { ...line, [key]: value } : line))
  }
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (!vendorId) return setError('Choose a vendor before completing the sale.')
    if (!lines.length || invalidLine) return setError('Check each item: choose a fruit and packaging size, use a positive quantity, and stay within the stock shown.')
    const paid = paymentMethod === 'Outstanding' ? 0 : (amountPaid === '' ? total : Number(amountPaid))
    if (paid > total) return setError('The amount paid cannot be more than the sale total.')
    setSaving(true)
    try {
      const result = await api('/sales', token, { method: 'POST', body: JSON.stringify({ vendorId: Number(vendorId), saleDate, paymentMethod, amountPaid: paid, items: lines.map((line) => ({ fruitId: Number(line.fruitId), packagingSize: line.packagingSize, quantity: Number(line.quantity) })) }) })
      setLines([{ fruitId: '', packagingSize: 'small', quantity: 1 }])
      setVendorId('')
      setAmountPaid('')
      onDone(`Sale #${result.saleId} recorded for ${money(result.totalAmount)}.`)
    } catch (submitError) {
      setError(submitError.message)
      onSubmitError(submitError)
    } finally { setSaving(false) }
  }
  return (
    <div className="screen-stack">
      <section className="panel sale-builder">
        <div className="panel-heading"><div><p className="eyebrow">New order</p><h2>Build a vendor sale</h2></div><span className="step-label">01 / RECORD SALE</span></div>
        <form onSubmit={submit}>
          <div className="form-grid three">
            <Field label="Vendor"><select value={vendorId} onChange={(event) => setVendorId(event.target.value)} required><option value="">Select a vendor</option>{vendors.map((item) => <option value={item.vendorId} key={item.vendorId}>{item.vendorName} · {item.location}</option>)}</select></Field>
            <Field label="Sale date"><input type="date" value={saleDate} onChange={(event) => setSaleDate(event.target.value)} required /></Field>
            <Field label="Payment method"><select value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setAmountPaid(event.target.value === 'Outstanding' ? '0' : '') }} >{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></Field>
          </div>
          <div className="line-items-heading"><div><h3>Sale items</h3><p>Select fruit and packaging for each item.</p></div><button className="button secondary" type="button" onClick={() => setLines([...lines, { fruitId: '', packagingSize: 'small', quantity: 1 }])}>+ Add item</button></div>
          <div className="builder-lines">{lines.map((line, index) => {
            const variants = stock.filter((record) => record.fruitId === Number(line.fruitId))
            const selectedStock = variants.find((record) => record.packagingSize === line.packagingSize)
            return <div className="builder-line" key={index}>
              <Field label={index === 0 ? 'Fruit' : `Fruit ${index + 1}`}><select value={line.fruitId} onChange={(event) => { const selected = stock.find((record) => record.fruitId === Number(event.target.value)); setError(''); setLines((previous) => previous.map((entry, i) => i === index ? { ...entry, fruitId: event.target.value, packagingSize: selected?.packagingSize || 'small' } : entry)) }}><option value="">Choose fruit</option>{[...new Map(stock.filter((item) => item.fruitStatus === 'active').map((item) => [item.fruitId, item])).values()].map((item) => <option key={item.fruitId} value={item.fruitId}>{item.fruitName}</option>)}</select></Field>
              <Field label="Packaging"><select value={line.packagingSize} onChange={(event) => updateLine(index, 'packagingSize', event.target.value)}>{SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></Field>
              <Field label="Quantity"><input className="numeric" type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(index, 'quantity', event.target.value)} /></Field>
              <div className="line-stock"><span>Available</span><b className="numeric">{selectedStock?.availableQuantity ?? 0}</b><small>{selectedStock ? `${money(selectedStock.unitSellingPrice)} / box` : 'No stock record'}</small></div>
              <button type="button" className="icon-button remove-line" aria-label="Remove item" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== index))}>×</button>
            </div>
          })}</div>
          <div className="sale-summary">
            <Field label="Amount paid now" hint={paymentMethod === 'Outstanding' ? 'Outstanding sales begin with no payment.' : 'Leave blank to record the full total as paid.'}><div className="money-input"><span>M</span><input type="number" min="0" step="0.01" value={paymentMethod === 'Outstanding' ? '0' : amountPaid} disabled={paymentMethod === 'Outstanding'} placeholder={total.toFixed(2)} onChange={(event) => setAmountPaid(event.target.value)} /></div></Field>
            <div className="total-preview"><span>Sale total</span><strong className="numeric">{money(total)}</strong><small>{paymentMethod === 'Outstanding' ? 'Payment due in full' : 'Live estimate from current prices'}</small></div>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {quantityAboveStock && <p className="form-error" role="alert">A selected quantity is above current stock. Reduce it to the available amount or record a purchase first.</p>}
          <div className="form-footer"><span className="muted">Stock is rechecked when you complete the sale.</span><button className="button primary" type="submit" disabled={saving}>{saving ? 'Recording…' : 'Complete Sale'}</button></div>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Ledger history</p><h2>Past sales</h2></div><div className="filters">
          <input placeholder="Search vendor…" aria-label="Search sales by vendor" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          <select aria-label="Filter payment status" value={filters.paymentStatus} onChange={(event) => setFilters({ ...filters, paymentStatus: event.target.value })}><option value="">All payments</option><option value="PAID">Paid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="UNPAID">Unpaid</option></select>
          <input type="date" aria-label="Sales from date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
          <input type="date" aria-label="Sales to date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
        </div></div>
        {data.sales.items?.length ? <div className="table-scroll"><table><thead><tr><th>Sale</th><th>Vendor</th><th>Date</th><th>Payment</th><th>Status</th><th className="align-right">Total</th><th className="align-right">Balance due</th></tr></thead><tbody>{data.sales.items.map((sale) => <tr key={sale.saleId} className="clickable-row" role="button" tabIndex={0} aria-label={`View sale ${sale.saleId} for ${sale.vendorName}`} onClick={(event) => onOpen(sale, event)} onKeyDown={(event) => activateRowOnKeyDown(event, (rowEvent) => onOpen(sale, rowEvent))}><td className="numeric">#{sale.saleId}</td><td><strong>{sale.vendorName}</strong></td><td className="numeric">{dateText(sale.saleDate)}</td><td>{sale.paymentMethod}</td><td><Status status={sale.paymentStatus} /></td><td className="numeric align-right">{money(sale.totalAmount)}</td><td className="numeric align-right">{money(sale.outstandingBalance)}</td></tr>)}</tbody></table></div> : <EmptyState title="No sales found" text={filters.search || filters.paymentStatus || filters.dateFrom || filters.dateTo ? 'No sales match the current search or filters. Clear them to review the full ledger.' : 'Completed vendor orders will appear here. You can start with the sale form above.'} action={filters.search || filters.paymentStatus || filters.dateFrom || filters.dateTo ? 'Clear filters' : undefined} onAction={() => setFilters({ search: '', paymentStatus: '', dateFrom: '', dateTo: '' })} />}
        <Pagination info={data.sales.pagination} onPage={setPage} />
      </section>
    </div>
  )
}

function PurchasesScreen({ data, token, setPage, onManageSuppliers, onPurchaseError, onDone, onPurchaseOpen }) {
  const [supplierId, setSupplierId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(today())
  const [lines, setLines] = useState([{ fruitId: '', packagingSize: 'small', quantity: 1, unitCost: '', unitSellingPrice: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const total = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0), 0)
  const update = (index, key, value) => setLines((previous) => previous.map((line, i) => i === index ? { ...line, [key]: value } : line))
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (!supplierId) return setError('Choose a supplier before recording this purchase.')
    if (lines.some((line) => !line.fruitId || Number(line.quantity) < 1 || Number(line.unitCost) <= 0)) return setError('Each purchase item needs a fruit, a positive box quantity, and a unit cost greater than M 0.00.')
    setSaving(true)
    try {
      const result = await api('/purchases', token, { method: 'POST', body: JSON.stringify({ supplierId: Number(supplierId), purchaseDate, items: lines.map((line) => ({ fruitId: Number(line.fruitId), packagingSize: line.packagingSize, quantity: Number(line.quantity), unitCost: Number(line.unitCost), ...(line.unitSellingPrice ? { unitSellingPrice: Number(line.unitSellingPrice) } : {}) })) }) })
      setLines([{ fruitId: '', packagingSize: 'small', quantity: 1, unitCost: '', unitSellingPrice: '' }])
      onDone(`Purchase #${result.purchaseId} recorded for ${money(result.totalAmount)}. Stock has been replenished.`)
    } catch (submitError) {
      setError(submitError.message)
      onPurchaseError(submitError)
    } finally { setSaving(false) }
  }
  return <div className="screen-stack">
    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">Restock the shelves</p><h2>Record a supplier purchase</h2></div><button className="button secondary" onClick={onManageSuppliers}>Manage suppliers</button></div>
      <form onSubmit={submit}>
        <div className="form-grid two"><Field label="Supplier"><select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required><option value="">Select a supplier</option>{data.suppliers.items?.map((supplier) => <option key={supplier.supplierId} value={supplier.supplierId}>{supplier.businessName} · {supplier.province}</option>)}</select></Field><Field label="Purchase date"><input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} required /></Field></div>
        <div className="line-items-heading"><div><h3>Purchase items</h3><p>Each line updates stock when the purchase is saved.</p></div><button className="button secondary" type="button" onClick={() => setLines([...lines, { fruitId: '', packagingSize: 'small', quantity: 1, unitCost: '', unitSellingPrice: '' }])}>+ Add item</button></div>
        <div className="builder-lines">{lines.map((line, index) => <div className="purchase-line" key={index}>
          <Field label="Fruit"><select value={line.fruitId} onChange={(event) => update(index, 'fruitId', event.target.value)}><option value="">Choose fruit</option>{data.fruits.items?.map((fruit) => <option key={fruit.fruitId} value={fruit.fruitId}>{fruit.fruitName}</option>)}</select></Field>
          <Field label="Packaging"><select value={line.packagingSize} onChange={(event) => update(index, 'packagingSize', event.target.value)}>{SIZES.map((size) => <option key={size}>{size}</option>)}</select></Field>
          <Field label="Boxes"><input className="numeric" type="number" min="1" value={line.quantity} onChange={(event) => update(index, 'quantity', event.target.value)} /></Field>
          <Field label="Cost / box (M)"><input type="number" min="0.01" step="0.01" value={line.unitCost} onChange={(event) => update(index, 'unitCost', event.target.value)} /></Field>
          <Field label="New sell price (M)"><input type="number" min="0.01" step="0.01" value={line.unitSellingPrice} placeholder="Keep current" onChange={(event) => update(index, 'unitSellingPrice', event.target.value)} /></Field>
          <button type="button" className="icon-button remove-line" aria-label="Remove item" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== index))}>×</button>
        </div>)}</div>
        <div className="form-footer"><span className="total-inline">Purchase total <b className="numeric">{money(total)}</b></span><button className="button primary" type="submit" disabled={saving}>{saving ? 'Recording…' : 'Record Purchase'}</button></div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </section>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Ledger history</p><h2>Recent purchases</h2></div></div>
      {data.purchases.items?.length ? <div className="table-scroll"><table><thead><tr><th>Purchase</th><th>Supplier</th><th>Date</th><th className="align-right">Total cost</th></tr></thead><tbody>{data.purchases.items.map((purchase) => <tr key={purchase.purchaseId} className="clickable-row" role="button" tabIndex={0} aria-label={`View purchase ${purchase.purchaseId} from ${purchase.supplierName}`} onClick={(event) => onPurchaseOpen(purchase, event)} onKeyDown={(event) => activateRowOnKeyDown(event, (rowEvent) => onPurchaseOpen(purchase, rowEvent))}><td className="numeric">#{purchase.purchaseId}</td><td><strong>{purchase.supplierName}</strong></td><td className="numeric">{dateText(purchase.purchaseDate)}</td><td className="numeric align-right">{money(purchase.totalAmount)}</td></tr>)}</tbody></table></div> : <EmptyState title="No purchases recorded" text="Your supplier replenishment history will appear here." />}
      <Pagination info={data.purchases.pagination} onPage={setPage} />
    </section>
  </div>
}

function VendorsScreen({ data, filters, setFilters, setPage, onVendorOpen }) {
  const vendors = data.vendors.items || []
  return <section className="panel">
    <div className="panel-heading"><div><p className="eyebrow">The people behind the produce</p><h2>Vendor records</h2></div><div className="filters">
      <input placeholder="Search name or phone…" aria-label="Search vendors" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
      <select aria-label="Filter vendor location" value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })}><option value="">All locations</option>{LOCATIONS.map((location) => <option key={location}>{location}</option>)}</select>
    </div></div>
    {vendors.length ? <div className="table-scroll"><table><thead><tr><th>Vendor</th><th>Location</th><th>Phone</th><th className="align-right">HQ distance</th></tr></thead><tbody>{vendors.map((vendor) => <tr key={vendor.vendorId} className="clickable-row" role="button" tabIndex={0} aria-label={`View ${vendor.vendorName} details`} onClick={(event) => onVendorOpen(vendor, event)} onKeyDown={(event) => activateRowOnKeyDown(event, (rowEvent) => onVendorOpen(vendor, rowEvent))}><td><strong>{vendor.vendorName}</strong><small className="row-sub">Registered <span className="numeric">{dateText(vendor.registrationDate)}</span></small></td><td>{vendor.location}</td><td>{vendor.phoneNumber}</td><td className="numeric align-right">{vendor.hqDistanceKm == null ? '—' : `${Number(vendor.hqDistanceKm).toFixed(1)} km`}</td></tr>)}</tbody></table></div> : <EmptyState title="No vendors found" text={filters.search || filters.location ? 'Try another search or clear the selected location.' : 'Add your first vendor to start recording Maseru sales.'} action={filters.search || filters.location ? 'Clear filters' : undefined} onAction={() => setFilters({ search: '', location: '' })} />}
    <Pagination info={data.vendors.pagination} onPage={setPage} />
    <div className="info-strip"><span className="info-dot">i</span><span>Distance from the farm is shown when location details are available.</span></div>
  </section>
}

function SuppliersScreen({ data, filters, setFilters, setPage, onEdit, onDelete }) {
  const suppliers = data.suppliers.items || []
  const hasFilters = Boolean(filters.search)
  const clearFilters = () => setFilters({ search: '' })
  return <section className="panel">
    <div className="panel-heading"><div><p className="eyebrow">Supplier directory</p><h2>Registered suppliers</h2></div><div className="filters">
      <input placeholder="Search business, contact, or phone…" aria-label="Search suppliers" value={filters.search} onChange={(event) => setFilters({ search: event.target.value })} />
      {hasFilters && <button className="button secondary small-button" onClick={clearFilters}>Clear search</button>}
    </div></div>
    {suppliers.length ? <div className="table-scroll"><table><thead><tr><th>Business</th><th>Contact person</th><th>Phone</th><th>Province</th><th>Address</th><th className="align-right">Delete</th></tr></thead><tbody>{suppliers.map((supplier) => <tr key={supplier.supplierId}>
      <td><button type="button" className="row-name-button" aria-label={`Edit ${supplier.businessName}`} onClick={(event) => onEdit(supplier, event)}>{supplier.businessName}</button></td><td>{supplier.contactPerson}</td><td>{supplier.phone}</td><td>{supplier.province}</td><td>{supplier.address}</td>
      <td className="align-right supplier-actions"><button type="button" className="icon-button danger-icon-button" aria-label={`Delete ${supplier.businessName}`} title={`Delete ${supplier.businessName}`} onClick={(event) => { event.stopPropagation(); onDelete(supplier, event) }}><Trash2 size={15} aria-hidden="true" /></button></td>
    </tr>)}</tbody></table></div> : <EmptyState title={hasFilters ? 'No suppliers match that search' : 'No suppliers registered'} text={hasFilters ? 'Try another business name, contact, or phone number.' : 'Add supplier contacts here so they are ready when purchases are recorded.'} action={hasFilters ? 'Clear search' : undefined} onAction={clearFilters} />}
    <Pagination info={data.suppliers.pagination} onPage={setPage} label="suppliers" />
  </section>
}

function UsersScreen({ data, filters, setFilters, setPage, currentUser, onEdit }) {
  const users = data.users.items || []
  return <section className="panel">
    <div className="panel-heading"><div><p className="eyebrow">Account directory</p><h2>Registered users</h2></div><div className="filters">
      <input placeholder="Search name or username…" aria-label="Search users" value={filters.search} onChange={(event) => setFilters({ search: event.target.value })} />
      {filters.search && <button className="button secondary small-button" onClick={() => setFilters({ search: '' })}>Clear search</button>}
    </div></div>
    {users.length ? <div className="table-scroll"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Created</th></tr></thead><tbody>{users.map((account) => <tr key={account.userId} className="clickable-row" role="button" tabIndex={0} aria-label={`Edit ${account.fullName}`} onClick={(event) => onEdit(account, event)} onKeyDown={(event) => activateRowOnKeyDown(event, (rowEvent) => onEdit(account, rowEvent))}>
      <td><strong>{account.fullName}</strong>{account.userId === currentUser.userId && <small className="row-sub">Your account</small>}</td>
      <td>{account.username}</td><td className="capitalize">{account.role}</td><td><Status status={account.isActive ? 'active' : 'inactive'} /></td>
      <td className="numeric">{dateText(account.createdAt)}</td>
    </tr>)}</tbody></table></div> : <EmptyState title={filters.search ? 'No users match that search' : 'No user accounts found'} text={filters.search ? 'Try another name or username.' : 'Create a user account to give a team member access to the ledger.'} action={filters.search ? 'Clear search' : undefined} onAction={() => setFilters({ search: '' })} />}
    <Pagination info={data.users.pagination} onPage={setPage} label="users" />
  </section>
}

function ReportsScreen({ data, reportDates, setReportDates }) {
  const [exportError, setExportError] = useState('')
  const [exportingXlsx, setExportingXlsx] = useState(false)
  const exportCsv = () => {
    setExportError('')
    try {
      downloadReportCsv(data, reportDates)
    } catch {
      setExportError('The CSV report could not be prepared. Please try again.')
    }
  }
  const exportXlsx = async () => {
    setExportError('')
    setExportingXlsx(true)
    try {
      await downloadReportXlsx(data, reportDates)
    } catch {
      setExportError('The XLSX report could not be prepared. Please try again.')
    } finally {
      setExportingXlsx(false)
    }
  }
  return <div className="reports-stack">
    <div className="report-actions">
      <div><p className="eyebrow">Report data</p><p className="muted">Exports include every report section and the selected revenue date range.</p></div>
      <div><button type="button" className="button secondary" onClick={exportCsv}><Download size={15} aria-hidden="true" />Download CSV</button><button type="button" className="button secondary" onClick={exportXlsx} disabled={exportingXlsx}><FileSpreadsheet size={15} aria-hidden="true" />{exportingXlsx ? 'Preparing XLSX…' : 'Download XLSX'}</button></div>
    </div>
    {exportError && <p className="form-error" role="alert">{exportError}</p>}
    <div className="report-grid">
      <section className="panel report-card"><div className="report-title"><span className="report-index">01</span><div><p className="eyebrow">Demand</p><h2>Top-selling fruits</h2></div></div>
        {data.topFruits.items?.length ? <div className="report-list">{data.topFruits.items.map((item, index) => <div className="report-list-row" key={item.fruitId}><span className="rank numeric">{String(index + 1).padStart(2, '0')}</span><b>{item.fruitName}</b><span className="numeric">{Number(item.totalBoxesSold).toLocaleString()} boxes</span></div>)}</div> : <p className="muted report-empty">No sales recorded yet.</p>}
      </section>
      <section className="panel report-card"><div className="report-title"><span className="report-index">02</span><div><p className="eyebrow">Cash flow</p><h2>Revenue in a date range</h2></div></div>
        <div className="report-date-fields"><Field label="From"><input type="date" value={reportDates.startDate} onChange={(event) => setReportDates({ ...reportDates, startDate: event.target.value })} /></Field><Field label="To"><input type="date" value={reportDates.endDate} onChange={(event) => setReportDates({ ...reportDates, endDate: event.target.value })} /></Field></div>
        <div className="report-kpis"><div><span>Sales</span><b className="numeric">{data.revenue.completedSalesCount}</b></div><div><span>Total revenue</span><b className="numeric">{money(data.revenue.totalSalesRevenue)}</b></div><div><span>Collected</span><b className="numeric">{money(data.revenue.totalAmountCollected)}</b></div><div><span>Uncollected</span><b className="numeric">{money(data.revenue.totalUncollectedInRange)}</b></div></div>
      </section>
      <section className="panel report-card"><div className="report-title"><span className="report-index">03</span><div><p className="eyebrow">Relationships</p><h2>Top vendor by boxes</h2></div></div>
        {data.topVendor.vendor ? <div className="top-vendor"><b>{data.topVendor.vendor.vendorName}</b><span>{data.topVendor.vendor.location} · {data.topVendor.vendor.phoneNumber}</span><div className="top-vendor-stats"><div><span>Boxes purchased</span><strong className="numeric">{Number(data.topVendor.vendor.totalBoxesPurchased).toLocaleString()}</strong></div><div><span>Balance due</span><strong className="numeric">{money(data.topVendor.vendor.outstandingBalance)}</strong></div></div></div> : <p className="muted report-empty">A top vendor will appear after the first sale.</p>}
      </section>
      <section className="panel report-card"><div className="report-title"><span className="report-index">04</span><div><p className="eyebrow">Availability</p><h2>Current stock levels</h2></div></div>
        {data.stockLevels.items?.length ? <div className="table-scroll compact-table"><table><thead><tr><th>Fruit</th><th>Size</th><th className="align-right">Boxes</th><th className="align-right">Price</th><th>Status</th></tr></thead><tbody>{data.stockLevels.items.map((item, i) => <tr key={`${item.fruitId}-${item.packagingSize}-${i}`}><td>{item.fruitName}</td><td className="capitalize">{item.packagingSize}</td><td className="numeric align-right">{Number(item.availableQuantity).toLocaleString()}</td><td className="numeric align-right">{money(item.unitSellingPrice)}</td><td><Status status={item.stockStatus} /></td></tr>)}</tbody></table></div> : <p className="muted report-empty">No stock records available.</p>}
      </section>
    </div>
  </div>
}

function FruitDrawer({ drawer, token, onDirty, onError, onDone }) {
  const [saving, setSaving] = useState(false)
  const fruit = drawer.fruit || {}
  const stock = drawer.stock
  const submit = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    try {
      if (drawer.mode === 'create') {
        await api('/fruits', token, { method: 'POST', body: JSON.stringify({ fruitName: form.get('fruitName'), description: form.get('description'), status: form.get('status'), lowStockThreshold: Number(form.get('lowStockThreshold')) }) })
      } else {
        const id = fruit.fruitId
        await api(`/fruits/${id}`, token, { method: 'PATCH', body: JSON.stringify({ fruitName: form.get('fruitName'), description: form.get('description'), status: form.get('status'), lowStockThreshold: Number(form.get('lowStockThreshold')) }) })
        if (stock) await api(`/stock/${stock.stockId}`, token, { method: 'PATCH', body: JSON.stringify({ availableQuantity: Number(form.get('availableQuantity')), unitSellingPrice: Number(form.get('unitSellingPrice')) }) })
      }
      onDone()
    } catch (error) { onError(error) } finally { setSaving(false) }
  }
  return <><p className="eyebrow">{drawer.mode === 'create' ? 'Admin · New record' : 'Admin · Edit record'}</p><h2>{drawer.mode === 'create' ? 'Register a fruit' : `Edit ${fruit.fruitName || 'fruit'}`}</h2><p className="drawer-intro">{drawer.mode === 'create' ? 'Add a variety to the farm ledger. Stock quantities and prices can be entered when the first purchase is recorded.' : 'Update the fruit record and, when selected, this packaging stock quantity and selling price.'}</p>
    <form className="drawer-form" onChange={() => onDirty(true)} onSubmit={submit}>
      <Field label="Fruit name"><input name="fruitName" defaultValue={fruit.fruitName || ''} list="fruit-name-suggestions" required /></Field><datalist id="fruit-name-suggestions">{FRUIT_NAMES.map((name) => <option key={name}>{name}</option>)}</datalist>
      <Field label="Description"><input name="description" defaultValue={fruit.description || ''} required /></Field>
      <Field label="Stock status"><select name="status" defaultValue={fruit.status || 'active'}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
      <Field label="Low-stock threshold (boxes)"><input className="numeric" type="number" name="lowStockThreshold" min="0" defaultValue={fruit.lowStockThreshold ?? 10} required /></Field>
      {stock && <div className="drawer-subsection"><h3>{stock.packagingSize} packaging stock</h3><Field label="Available boxes"><input className="numeric" name="availableQuantity" type="number" min="0" defaultValue={stock.availableQuantity} required /></Field><Field label="Selling price per box (M)"><input name="unitSellingPrice" type="number" min="0.01" step="0.01" defaultValue={stock.unitSellingPrice} required /></Field></div>}
      <div className="drawer-actions"><button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : drawer.mode === 'create' ? 'Register Fruit' : 'Save Changes'}</button></div>
    </form>
  </>
}

function SaleDrawer({ drawer, token, onDirty, onError, onDone }) {
  const [sale, setSale] = useState(null)
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    api(`/sales/${drawer.saleId}`, token).then((result) => setSale(result.sale)).catch(onError).finally(() => setLoading(false))
  }, [drawer.saleId, token, onError])
  if (loading) return <><p className="eyebrow">Sale details</p><h2>Loading sale…</h2><Skeleton /></>
  if (!sale) return <><p className="eyebrow">Sale details</p><h2>Sale unavailable</h2><p className="drawer-intro">We could not retrieve this sale. Close this panel and try again.</p></>
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (Number(amount) <= 0) return setError('Enter a payment amount greater than M 0.00.')
    setSaving(true)
    try {
      const result = await api(`/sales/${sale.saleId}/payment`, token, { method: 'PATCH', body: JSON.stringify({ amount: Number(amount), paymentMethod }) })
      setSale({ ...sale, ...result })
      setAmount('')
      onDone(`Payment recorded for sale #${sale.saleId}. Balance due: ${money(result.outstandingBalance)}.`)
    } catch (paymentError) { setError(paymentError.message); onError(paymentError) } finally { setSaving(false) }
  }
  return <><p className="eyebrow">Sale #{sale.saleId}</p><h2>{sale.vendorName}</h2><p className="drawer-intro">Recorded <span className="numeric">{dateText(sale.saleDate)}</span> · {sale.paymentMethod}</p>
    <div className="drawer-summary"><div><span>Total</span><b className="numeric">{money(sale.totalAmount)}</b></div><div><span>Paid</span><b className="numeric">{money(sale.amountPaid)}</b></div><div><span>Balance due</span><b className="numeric">{money(sale.outstandingBalance)}</b></div><div><span>Status</span><Status status={sale.paymentStatus} /></div></div>
    <div className="drawer-subsection"><h3>Items sold</h3>{sale.items?.map((item, index) => <div className="detail-row" key={`${item.fruitId}-${item.packagingSize}-${index}`}><span>{item.fruitName} <small>{item.packagingSize}</small></span><b className="numeric">{item.quantity} × {money(item.unitPrice)}</b></div>)}</div>
    {Number(sale.outstandingBalance) > 0 && <form className="drawer-form payment-form" onChange={() => onDirty(true)} onSubmit={submit}><h3>Record a payment</h3><Field label="Amount received (M)"><input type="number" min="0.01" step="0.01" max={sale.outstandingBalance} value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field><Field label="Payment method"><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{PAYMENT_METHODS.filter((method) => method !== 'Outstanding').map((method) => <option key={method}>{method}</option>)}</select></Field>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={saving}>{saving ? 'Saving payment…' : 'Update Balance'}</button></form>}
  </>
}

function UserDrawer({ drawer, token, currentUser, onDirty, onDone }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const account = drawer.user || {}
  const editing = drawer.mode === 'edit'
  const isSelf = editing && account.userId === currentUser.userId

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const body = {
      fullName: form.get('fullName'),
      username: form.get('username'),
    }
    const password = form.get('password')
    if (password || !editing) body.password = password
    if (!isSelf) {
      body.role = form.get('role')
      if (editing) body.isActive = form.get('isActive') === 'true'
    }
    setSaving(true)
    try {
      if (editing) {
        const result = await api(`/users/${account.userId}`, token, { method: 'PATCH', body: JSON.stringify(body) })
        onDone('User account updated.', result.user)
      } else {
        await api('/users', token, { method: 'POST', body: JSON.stringify(body) })
        onDone('User account created.')
      }
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  return <>
    <p className="eyebrow">Admin · User accounts</p>
    <h2>{editing ? `Edit ${account.fullName}` : 'Create a user account'}</h2>
    <p className="drawer-intro">{editing ? 'Update account details, access role, or set a replacement password.' : 'Set up an account for a team member to sign in to the farm ledger.'}</p>
    <form className="drawer-form" onChange={() => onDirty(true)} onSubmit={submit}>
      <Field label="Full name"><input name="fullName" defaultValue={account.fullName || ''} maxLength="120" autoComplete="name" required /></Field>
      <Field label="Username"><input name="username" defaultValue={account.username || ''} maxLength="60" autoComplete="username" required /></Field>
      <Field label={editing ? 'New password (optional)' : 'Password'} hint={editing ? 'Leave blank to keep the current password.' : 'Use at least 8 characters.'}>
        <input name="password" type="password" minLength="8" maxLength="128" autoComplete="new-password" required={!editing} />
      </Field>
      {isSelf
        ? <p className="form-hint">Your own role and active status cannot be changed here.</p>
        : <>
          <Field label="Role"><select name="role" defaultValue={account.role || 'sales'}><option value="sales">Sales</option><option value="admin">Admin</option></select></Field>
          {editing && <Field label="Account status"><select name="isActive" defaultValue={account.isActive ? 'true' : 'false'}><option value="true">Active</option><option value="false">Inactive</option></select></Field>}
        </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="drawer-actions"><button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save User' : 'Create User'}</button></div>
    </form>
  </>
}

function SupplierFormDrawer({ drawer, token, onDirty, onError, onDone }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supplier = drawer.supplier || {}
  const editing = drawer.mode === 'edit'
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const body = JSON.stringify({ businessName: form.get('businessName'), contactPerson: form.get('contactPerson'), phone: form.get('phone'), province: form.get('province'), address: form.get('address') })
    setSaving(true)
    try {
      if (editing) {
        await api(`/suppliers/${supplier.supplierId}`, token, { method: 'PATCH', body })
        onDone('Supplier details updated.')
      } else {
        await api('/suppliers', token, { method: 'POST', body })
        onDone('Supplier added to the directory.')
      }
    } catch (submitError) { setError(submitError.message); onError(submitError) } finally { setSaving(false) }
  }
  return <><p className="eyebrow">Admin · supplier directory</p><h2>{editing ? 'Edit supplier' : 'Add supplier'}</h2><p className="drawer-intro">Keep South African supplier contacts ready for the next replenishment.</p>
    <form className="drawer-form" onChange={() => onDirty(true)} onSubmit={submit}>
      <Field label="Business name"><input name="businessName" defaultValue={supplier.businessName || ''} maxLength="140" required /></Field><Field label="Contact person"><input name="contactPerson" defaultValue={supplier.contactPerson || ''} maxLength="140" required /></Field><Field label="Phone"><input name="phone" type="tel" defaultValue={supplier.phone || ''} maxLength="140" required /></Field>
      <Field label="Province"><select name="province" required defaultValue={supplier.province || ''}><option value="" disabled>Choose province</option>{PROVINCES.map((province) => <option key={province}>{province}</option>)}</select></Field>
      <Field label="Address"><input name="address" defaultValue={supplier.address || ''} maxLength="255" required /></Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="drawer-actions"><button className="button primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add supplier'}</button></div>
    </form>
  </>
}

function DeleteSupplierModal({ supplier, token, onCancel, onError, onDone }) {
  const [saving, setSaving] = useState(false)
  const remove = async () => {
    setSaving(true)
    try {
      await api(`/suppliers/${supplier.supplierId}`, token, { method: 'DELETE' })
      onDone()
    } catch (error) {
      onError(error.status === 403 ? 'Admin access is required to delete suppliers.' : error.status === 409 ? 'This supplier has purchase history and cannot be deleted. Keep it in the ledger so past records stay connected.' : error.message)
    } finally { setSaving(false) }
  }
  return <div className="modal-actions"><button className="button secondary" onClick={onCancel}>Keep supplier</button><button className="button danger" disabled={saving} onClick={remove}>{saving ? 'Deleting…' : 'Delete supplier'}</button></div>
}

function StockItemModal({ item, token, confirmDiscard, onDirty, onKeepEditing, onDiscard, onCancel, onError, onDone }) {
  const [availableQuantity, setAvailableQuantity] = useState(String(item.availableQuantity))
  const [unitSellingPrice, setUnitSellingPrice] = useState(String(item.unitSellingPrice))
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      await api(`/stock/${item.stockId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ availableQuantity: Number(availableQuantity), unitSellingPrice: Number(unitSellingPrice) }),
      })
      onDone(`${item.packagingSize} ${item.fruitName} stock updated.`)
    } catch (error) {
      onError(error.status === 403 ? 'Admin access is required to edit stock.' : error.message)
    } finally { setSaving(false) }
  }
  const remove = async () => {
    setSaving(true)
    try {
      await api(`/stock/${item.stockId}`, token, { method: 'DELETE' })
      onDone(`${item.packagingSize} ${item.fruitName} stock deleted.`, true)
    } catch (error) {
      onError(error.status === 403
        ? 'Admin access is required to delete stock.'
        : error.status === 409
          ? 'This packaging stock has purchase or sales history and cannot be deleted.'
          : error.message)
    } finally { setSaving(false) }
  }
  if (confirmDiscard) return <div className="modal-actions">
    <button type="button" className="button secondary" onClick={onKeepEditing}>Keep editing</button>
    <button type="button" className="button danger" onClick={onDiscard}>Discard changes</button>
  </div>
  return <>
    <form className="drawer-form stock-item-form" onChange={onDirty} onSubmit={submit}>
      <Field label="Available boxes"><input className="numeric" name="availableQuantity" type="number" min="0" step="1" value={availableQuantity} onChange={(event) => setAvailableQuantity(event.target.value)} required /></Field>
      <Field label="Selling price per box (M)"><input className="numeric" name="unitSellingPrice" type="number" min="0.01" step="0.01" value={unitSellingPrice} onChange={(event) => setUnitSellingPrice(event.target.value)} required /></Field>
      <div className="stock-item-actions">
        {!confirmingDelete && <button type="button" className="text-button danger-text stock-delete-trigger" disabled={saving} onClick={() => setConfirmingDelete(true)}>Delete packaging item</button>}
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
      </div>
    </form>
    {confirmingDelete
      ? <div className="stock-delete-confirm"><p>Delete this packaging stock record? Records with purchase or sales history cannot be removed.</p><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setConfirmingDelete(false)}>Keep packaging</button><button type="button" className="button danger" disabled={saving} onClick={remove}>{saving ? 'Deleting…' : 'Delete packaging'}</button></div></div>
      : null}
  </>
}

function VendorDrawer({ drawer, token, onDirty, onError, onDone, onPayment, onManagePayments }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [vendorSales, setVendorSales] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(Boolean(drawer.payments))
  const [editing, setEditing] = useState(false)
  const vendor = drawer.vendor || {}
  useEffect(() => {
    if (!drawer.payments || !vendor.vendorId) return
    let active = true
    Promise.all([
      api(`/sales${query({ vendorId: vendor.vendorId, paymentStatus: 'UNPAID', limit: 100 })}`, token),
      api(`/sales${query({ vendorId: vendor.vendorId, paymentStatus: 'PARTIALLY_PAID', limit: 100 })}`, token),
    ]).then(([unpaid, partial]) => {
      if (active) setVendorSales([...unpaid.items, ...partial.items])
    }).catch((reason) => {
      if (active) setError(reason.message)
      onError(reason)
    }).finally(() => { if (active) setPaymentsLoading(false) })
    return () => { active = false }
  }, [drawer.payments, vendor.vendorId, token, onError])
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const latText = form.get('latitude')
    const lonText = form.get('longitude')
    const body = { vendorName: form.get('vendorName'), phoneNumber: form.get('phoneNumber'), location: form.get('location'), latitude: latText === '' ? null : Number(latText), longitude: lonText === '' ? null : Number(lonText) }
    setSaving(true)
    try {
      if (drawer.mode === 'create') await api('/vendors', token, { method: 'POST', body: JSON.stringify(body) })
      else await api(`/vendors/${vendor.vendorId}`, token, { method: 'PATCH', body: JSON.stringify(body) })
      onDone()
    } catch (submitError) { setError(submitError.message); onError(submitError) } finally { setSaving(false) }
  }
  if (drawer.payments && vendor) return <><p className="eyebrow">Vendor payments</p><h2>{vendor.vendorName}</h2><p className="drawer-intro">Choose an outstanding sale to record a payment and update the balance.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {paymentsLoading ? <Skeleton /> : vendorSales.length ? <div className="vendor-payment-list">{vendorSales.map((sale) => <div className="payment-sale" key={sale.saleId}><div><b>Sale #{sale.saleId}</b><span className="numeric">{dateText(sale.saleDate)} · due {money(sale.outstandingBalance)}</span><Status status={sale.paymentStatus} /></div><button className="button secondary small-button" onClick={(event) => onPayment(sale, event)}>Record payment</button></div>)}</div> : !error && <EmptyState title="All caught up" text="This vendor has no outstanding sales in the ledger." />}</>
  if (drawer.mode !== 'create' && vendor) return <><p className="eyebrow">Vendor directory</p><h2>{vendor.vendorName}</h2><p className="drawer-intro">Vendor details and location in the Maseru distribution network.</p>
    {!editing && <>
      <div className="drawer-summary"><div><span>Location</span><b>{vendor.location}</b></div><div><span>Phone</span><b>{vendor.phoneNumber}</b></div><div><span>Distance from HQ</span><b className="numeric">{vendor.hqDistanceKm == null ? 'Not available' : `${Number(vendor.hqDistanceKm).toFixed(1)} km`}</b></div><div><span>Registered</span><b className="numeric">{dateText(vendor.registrationDate)}</b></div></div>
      <button className="button secondary full-button vendor-payments-button" onClick={(event) => onManagePayments(vendor, event)}>View and record payments</button>
      <button className="button secondary full-button" onClick={() => setEditing(true)}>Edit vendor details</button>
    </>}
    {editing && <form className="drawer-form vendor-form" onChange={() => onDirty(true)} onSubmit={submit}><VendorFields vendor={vendor} onDirty={() => onDirty(true)} /><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save Vendor'}</button>{error && <p className="form-error" role="alert">{error}</p>}</form>}
  </>
  return <><p className="eyebrow">Vendor directory · Maseru</p><h2>Add a vendor</h2><p className="drawer-intro">Add contact details and optionally choose a map pin for distance from farm HQ.</p><form className="drawer-form vendor-form" onChange={() => onDirty(true)} onSubmit={submit}><VendorFields vendor={vendor} onDirty={() => onDirty(true)} /><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Add Vendor'}</button>{error && <p className="form-error" role="alert">{error}</p>}</form></>
}

function MapClickPicker({ onPick }) {
  useMapEvents({ click: (event) => onPick(event.latlng.lat, event.latlng.lng) })
  return null
}

const vendorPinIcon = L.divIcon({
  className: 'vendor-map-marker',
  html: '<span></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

function VendorMap({ latitude, longitude, onPick }) {
  const hasPin = latitude !== '' && longitude !== '' && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
  const position = hasPin ? [Number(latitude), Number(longitude)] : null
  const center = position || [-29.31, 27.48]
  const updateMarker = (event) => {
    const point = event.target.getLatLng()
    onPick(point.lat, point.lng)
  }
  return <div className="vendor-map-wrap">
    <MapContainer center={center} zoom={position ? 14 : 12} scrollWheelZoom={false} className="vendor-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapClickPicker onPick={onPick} />
      {position && <Marker position={position} icon={vendorPinIcon} draggable eventHandlers={{ dragend: updateMarker }} />}
    </MapContainer>
    <small>Click the map to place a pin, or drag it to the trading spot. Map data © OpenStreetMap.</small>
  </div>
}

function VendorFields({ vendor, onDirty }) {
  const [latitude, setLatitude] = useState(vendor.latitude ?? '')
  const [longitude, setLongitude] = useState(vendor.longitude ?? '')
  const [phoneNumber, setPhoneNumber] = useState(() => sanitizePhoneNumber(vendor.phoneNumber || ''))
  const [location, setLocation] = useState(vendor.location || '')
  const [mapPickerOpen, setMapPickerOpen] = useState(false)
  const [locationLookupError, setLocationLookupError] = useState('')
  const lookupSequence = useRef(0)
  const setCoordinates = async (lat, lon) => {
    setLatitude(Number(lat).toFixed(6))
    setLongitude(Number(lon).toFixed(6))
    const lookupId = ++lookupSequence.current
    setLocation('Pinned market location')
    setLocationLookupError('')
    setMapPickerOpen(false)
    onDirty?.()
    try {
      const params = new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lon), 'accept-language': 'en' })
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`)
      if (!response.ok) throw new Error('Location lookup failed.')
      const result = await response.json()
      const address = result.address || {}
      const placeNames = [address.neighbourhood, address.suburb, address.hamlet, address.village, address.town, address.city, address.county, address.road]
        .filter((name, index, names) => name && names.findIndex((candidate) => candidate?.toLowerCase() === name.toLowerCase()) === index)
        .slice(0, 2)
      const label = placeNames.join(', ') || result.name || result.display_name || 'Pinned market location'
      if (lookupId === lookupSequence.current) setLocation(label.slice(0, 160))
    } catch {
      if (lookupId === lookupSequence.current) setLocationLookupError('We could not find a place name for this pin. You can enter the market location yourself.')
    }
  }
  useEffect(() => {
    if (!mapPickerOpen) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setMapPickerOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [mapPickerOpen])
  return <>
    <div className="vendor-contact-fields"><Field label="Vendor name"><input name="vendorName" defaultValue={vendor.vendorName || ''} required /></Field><Field label="Phone number"><input name="phoneNumber" type="tel" inputMode="tel" pattern="(?=.*[0-9])[0-9+ ]+" title="Use digits, +, and single spaces only." maxLength="30" value={phoneNumber} onChange={(event) => setPhoneNumber(sanitizePhoneNumber(event.target.value))} required /></Field></div>
    <Field label="Market location"><div className="location-picker-row"><input name="location" value={location} maxLength="160" onChange={(event) => { lookupSequence.current += 1; setLocation(event.target.value); setLocationLookupError('') }} required /><button type="button" className="button secondary map-picker-button" onClick={() => setMapPickerOpen(true)}><MapPin size={15} aria-hidden="true" />Choose on map</button></div></Field>
    {locationLookupError && <p className="form-hint" role="status">{locationLookupError}</p>}
    <input type="hidden" name="latitude" value={latitude} /><input type="hidden" name="longitude" value={longitude} />
    {mapPickerOpen && <div className="map-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMapPickerOpen(false) }}>
      <section className="map-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="map-picker-title">
        <button type="button" className="drawer-close" aria-label="Close map picker" onClick={() => setMapPickerOpen(false)}>×</button>
        <h3 id="map-picker-title">Choose market location</h3>
        <VendorMap latitude={latitude} longitude={longitude} onPick={setCoordinates} />
      </section>
    </div>}
  </>
}

function PurchaseDrawer({ drawer, token }) {
  const [purchase, setPurchase] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api(`/purchases/${drawer.purchaseId}`, token).then((result) => setPurchase(result.purchase)).catch((reason) => setError(reason.message))
  }, [drawer.purchaseId, token])
  if (error) return <><p className="eyebrow">Purchase details</p><h2>Unable to load details</h2><p className="form-error">{error}</p></>
  if (!purchase) return <><p className="eyebrow">Purchase details</p><h2>Loading purchase…</h2><Skeleton /></>
  return <><p className="eyebrow">Purchase #{purchase.purchaseId}</p><h2>{purchase.supplierName}</h2><p className="drawer-intro">Recorded <span className="numeric">{dateText(purchase.purchaseDate)}</span></p><div className="drawer-summary"><div><span>Total cost</span><b className="numeric">{money(purchase.totalAmount)}</b></div></div><div className="drawer-subsection"><h3>Items received</h3>{purchase.items?.map((item, index) => <div className="detail-row" key={`${item.fruitId}-${index}`}><span>{item.fruitName} <small>{item.packagingSize}</small></span><b className="numeric">{item.quantity} × {money(item.unitCost)}</b></div>)}</div></>
}

export default App
