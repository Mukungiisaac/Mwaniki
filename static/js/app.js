/**
 * Mwaniki Furnitures POS — Frontend Application
 * Handles product display, cart management, sales processing, and UI interactions.
 */

// ─── State ─────────────────────────────────────────────────────────────────────
let products = [];
let cart = [];
let activeCategory = 'all';
let editingProductId = null;
let selectedPaymentMethod = 'Cash'; // Default payment method
let users = []; // For admin-only user management


// ─── DOM References ────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Utility: Format currency ──────────────────────────────────────────────────
function formatPrice(amount) {
    return 'KSh ' + Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Toast Notifications ───────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ─── Tab Navigation ────────────────────────────────────────────────────────────
function initTabs() {
    $$('.nav-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            $$('.nav-tab').forEach(t => t.classList.remove('active'));
            $$('.tab-content').forEach(tc => tc.classList.remove('active'));
            tab.classList.add('active');
            $(`#tab-${tab.dataset.tab}`).classList.add('active');
            // Refresh data when switching tabs
            if (tab.dataset.tab === 'products') loadProductsTable();
            if (tab.dataset.tab === 'sales') loadSalesHistory();
            if (tab.dataset.tab === 'pos') renderPOSGrid();
            if (tab.dataset.tab === 'users') {
                await fetchUsers();
                loadUsersTable();
            }
        });
    });
}


// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTS API
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchProducts() {
    try {
        const res = await fetch('/api/products');
        products = await res.json();
        updateStats();
        return products;
    } catch (err) {
        showToast('Failed to load products', 'error');
        return [];
    }
}

async function saveProduct(data) {
    const url = editingProductId ? `/api/products/${editingProductId}` : '/api/products';
    const method = editingProductId ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        showToast(editingProductId ? 'Product updated!' : 'Product added!');
        resetForm();
        await fetchProducts();
        loadProductsTable();
        renderPOSGrid();
    } catch (err) {
        showToast(err.message || 'Failed to save product', 'error');
    }
}

async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
        const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        showToast('Product deleted');
        // Remove from cart if present
        cart = cart.filter(item => item.product_id !== id);
        renderCart();
        await fetchProducts();
        loadProductsTable();
        renderPOSGrid();
    } catch (err) {
        showToast(err.message || 'Failed to delete', 'error');
    }
}

// ─── Product Form ──────────────────────────────────────────────────────────────
function initProductForm() {
    $('#product-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const data = {
            name: $('#product-name').value.trim(),
            category: $('#product-category').value,
            price: parseFloat($('#product-price').value),
            stock: parseInt($('#product-stock').value)
        };
        if (!data.name || !data.category || isNaN(data.price) || isNaN(data.stock)) {
            showToast('Please fill in all fields correctly', 'warning');
            return;
        }
        saveProduct(data);
    });

    $('#btn-cancel-edit').addEventListener('click', resetForm);
}

function resetForm() {
    editingProductId = null;
    $('#product-form').reset();
    $('#edit-product-id').value = '';
    $('#form-title').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add New Product`;
    $('#btn-save-product').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Product`;
    $('#btn-cancel-edit').style.display = 'none';
}

function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    editingProductId = id;
    $('#product-name').value = product.name;
    $('#product-category').value = product.category;
    $('#product-price').value = product.price;
    $('#product-stock').value = product.stock;
    $('#form-title').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit Product`;
    $('#btn-save-product').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Update Product`;
    $('#btn-cancel-edit').style.display = 'inline-flex';
    // Switch to products tab
    $$('.nav-tab').forEach(t => t.classList.remove('active'));
    $$('.tab-content').forEach(tc => tc.classList.remove('active'));
    $('#nav-products').classList.add('active');
    $('#tab-products').classList.add('active');
    $('#product-name').focus();
}

// ─── Products Table ────────────────────────────────────────────────────────────
function loadProductsTable() {
    const tbody = $('#products-table-body');
    const searchTerm = ($('#product-table-search')?.value || '').toLowerCase();
    const filtered = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm) || p.category.toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        $('#products-empty').style.display = 'flex';
        $('.table-wrapper').style.display = 'none';
        return;
    }

    $('#products-empty').style.display = 'none';
    $('.table-wrapper').style.display = 'block';

    tbody.innerHTML = filtered.map(p => {
        let stockClass = 'in-stock', stockLabel = p.stock;
        if (p.stock === 0) { stockClass = 'out-of-stock'; stockLabel = 'Out'; }
        else if (p.stock <= 5) { stockClass = 'low-stock'; stockLabel = p.stock + ' left'; }
        return `<tr>
            <td>#${p.id}</td>
            <td><strong>${escHtml(p.name)}</strong></td>
            <td>${escHtml(p.category)}</td>
            <td>${formatPrice(p.price)}</td>
            <td><span class="stock-badge ${stockClass}">${stockLabel}</span></td>
            <td><div class="action-btns">
                <button class="btn-edit" onclick="editProduct(${p.id})" title="Edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="btn-delete" onclick="deleteProduct(${p.id})" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div></td>
        </tr>`;
    }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// POS TERMINAL
// ═══════════════════════════════════════════════════════════════════════════════

function renderPOSGrid() {
    const grid = $('#pos-product-grid');
    const search = ($('#pos-search')?.value || '').toLowerCase();
    let filtered = products.filter(p =>
        p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search)
    );
    if (activeCategory !== 'all') {
        filtered = filtered.filter(p => p.category === activeCategory);
    }

    if (filtered.length === 0) {
        grid.innerHTML = '';
        $('#pos-empty').style.display = 'flex';
        grid.style.display = 'none';
        return;
    }

    $('#pos-empty').style.display = 'none';
    grid.style.display = 'grid';

    grid.innerHTML = filtered.map(p => {
        const oos = p.stock === 0;
        const low = p.stock > 0 && p.stock <= 5;
        return `<div class="pos-product-card ${oos ? 'out-of-stock' : ''}" onclick="openQtyModal(${p.id})">
            <div class="pos-card-category">${escHtml(p.category)}</div>
            <div class="pos-card-name">${escHtml(p.name)}</div>
            <div class="pos-card-bottom">
                <div class="pos-card-price">${formatPrice(p.price)}</div>
                <div class="pos-card-stock ${low ? 'low' : ''}">${oos ? 'Out of stock' : p.stock + ' in stock'}</div>
            </div>
        </div>`;
    }).join('');
}

function renderCategoryFilters() {
    const cats = [...new Set(products.map(p => p.category))].sort();
    const container = $('#category-filters');
    container.innerHTML = `<button class="cat-pill ${activeCategory === 'all' ? 'active' : ''}" data-category="all">All</button>` +
        cats.map(c => `<button class="cat-pill ${activeCategory === c ? 'active' : ''}" data-category="${escHtml(c)}">${escHtml(c)}</button>`).join('');
    container.querySelectorAll('.cat-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            activeCategory = btn.dataset.category;
            container.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderPOSGrid();
        });
    });
}

// ─── Quantity Modal ────────────────────────────────────────────────────────────
let qtyProductId = null;

function openQtyModal(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || product.stock === 0) return;
    qtyProductId = productId;
    $('#qty-modal-title').textContent = product.name;
    $('#qty-modal-info').textContent = `${formatPrice(product.price)} · ${product.stock} in stock`;
    $('#qty-input').value = 1;
    $('#qty-input').max = product.stock;
    $('#qty-modal-overlay').classList.add('visible');
    setTimeout(() => $('#qty-input').focus(), 200);
}

function initQtyModal() {
    $('#qty-minus').addEventListener('click', () => {
        const input = $('#qty-input');
        if (parseInt(input.value) > 1) input.value = parseInt(input.value) - 1;
    });
    $('#qty-plus').addEventListener('click', () => {
        const input = $('#qty-input');
        const product = products.find(p => p.id === qtyProductId);
        // Account for items already in cart
        const inCart = cart.find(c => c.product_id === qtyProductId);
        const maxAvail = product ? product.stock - (inCart ? inCart.quantity : 0) : 1;
        if (parseInt(input.value) < maxAvail) input.value = parseInt(input.value) + 1;
    });
    $('#qty-cancel').addEventListener('click', () => {
        $('#qty-modal-overlay').classList.remove('visible');
        qtyProductId = null;
    });
    $('#qty-confirm').addEventListener('click', () => {
        const qty = parseInt($('#qty-input').value);
        if (qty > 0 && qtyProductId) addToCart(qtyProductId, qty);
        $('#qty-modal-overlay').classList.remove('visible');
        qtyProductId = null;
    });
    // Close on overlay click
    $('#qty-modal-overlay').addEventListener('click', (e) => {
        if (e.target === $('#qty-modal-overlay')) {
            $('#qty-modal-overlay').classList.remove('visible');
            qtyProductId = null;
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CART
// ═══════════════════════════════════════════════════════════════════════════════

function addToCart(productId, quantity) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existing = cart.find(item => item.product_id === productId);
    if (existing) {
        const newQty = existing.quantity + quantity;
        if (newQty > product.stock) {
            showToast(`Only ${product.stock} available for ${product.name}`, 'warning');
            return;
        }
        existing.quantity = newQty;
    } else {
        if (quantity > product.stock) {
            showToast(`Only ${product.stock} available`, 'warning');
            return;
        }
        cart.push({ product_id: productId, name: product.name, price: product.price, quantity });
    }
    showToast(`${product.name} added to cart`);
    renderCart();
}

function updateCartQty(productId, delta) {
    const item = cart.find(i => i.product_id === productId);
    const product = products.find(p => p.id === productId);
    if (!item || !product) return;
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
        cart = cart.filter(i => i.product_id !== productId);
    } else if (newQty > product.stock) {
        showToast(`Only ${product.stock} in stock`, 'warning');
        return;
    } else {
        item.quantity = newQty;
    }
    renderCart();
}

function removeFromCart(productId) {
    cart = cart.filter(i => i.product_id !== productId);
    renderCart();
}

function clearCart() {
    if (cart.length === 0) return;
    cart = [];
    renderCart();
    showToast('Cart cleared');
}

function getCartTotal() {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function renderCart() {
    const container = $('#cart-items');
    const emptyEl = $('#cart-empty');
    const payBtn = $('#btn-pay');

    updateStats();

    if (cart.length === 0) {
        container.innerHTML = '';
        container.appendChild(emptyEl);
        emptyEl.style.display = 'flex';
        payBtn.disabled = true;
        $('#cart-total').textContent = 'KSh 0.00';
        return;
    }

    emptyEl.style.display = 'none';
    payBtn.disabled = false;
    const total = getCartTotal();
    $('#cart-total').textContent = formatPrice(total);

    container.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <div class="cart-item-name">${escHtml(item.name)}</div>
                <div class="cart-item-price">${formatPrice(item.price)} each</div>
            </div>
            <div class="cart-item-qty">
                <button onclick="updateCartQty(${item.product_id}, -1)">−</button>
                <span>${item.quantity}</span>
                <button onclick="updateCartQty(${item.product_id}, 1)">+</button>
            </div>
            <div class="cart-item-total">${formatPrice(item.price * item.quantity)}</div>
            <button class="cart-item-remove" onclick="removeFromCart(${item.product_id})">×</button>
        </div>
    `).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT METHOD
// ═══════════════════════════════════════════════════════════════════════════════

function initPaymentMethod() {
    // Attach click listeners to Cash and M-Pesa buttons
    $$('.payment-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.payment-opt').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedPaymentMethod = btn.dataset.method;
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKOUT / PAY
// ═══════════════════════════════════════════════════════════════════════════════

async function processSale() {
    if (cart.length === 0) return;
    const total = getCartTotal();

    // Capture cart snapshot before clearing (for receipt)
    const cartSnapshot = cart.map(item => ({ ...item }));

    const saleData = {
        items: cartSnapshot.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price
        })),
        total_amount: total,
        payment_method: selectedPaymentMethod
    };

    // Disable pay button to prevent double-click
    const payBtn = $('#btn-pay');
    payBtn.disabled = true;
    payBtn.textContent = 'Processing...';

    try {
        const res = await fetch('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(saleData)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);

        // Populate and show receipt modal
        populateReceipt(result, cartSnapshot, total);
        $('#modal-overlay').classList.add('visible');

        // Clear cart and refresh products
        cart = [];
        renderCart();
        await fetchProducts();
        renderPOSGrid();
        renderCategoryFilters();
    } catch (err) {
        showToast(err.message || 'Sale failed', 'error');
        payBtn.disabled = false;
        payBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Pay Now`;
    }
}

// ─── Populate Receipt Modal ─────────────────────────────────────────────────────
function populateReceipt(result, cartSnapshot, total) {
    // Screen header
    $('#modal-sale-info').textContent = `Sale #${result.sale_id} · ${result.payment_method}`;

    // Receipt fields
    $('#r-sale-id').textContent = result.sale_id;
    $('#r-date').textContent    = result.date;
    $('#r-payment').textContent = result.payment_method;
    $('#r-total').textContent   = formatPrice(total);

    // Items rows
    $('#r-items-body').innerHTML = cartSnapshot.map(item => `
        <tr>
            <td>${escHtml(item.name)}</td>
            <td style="text-align:center">${item.quantity}</td>
            <td>${formatPrice(item.price)}</td>
            <td>${formatPrice(item.price * item.quantity)}</td>
        </tr>
    `).join('');
}

// ─── Print Receipt ─────────────────────────────────────────────────────────────
function printReceipt() {
    window.print();
}

// ─── Receipt Modal Init ────────────────────────────────────────────────────────
function initSaleModal() {
    $('#btn-modal-close').addEventListener('click', () => {
        $('#modal-overlay').classList.remove('visible');
    });
    $('#btn-print-receipt').addEventListener('click', printReceipt);
    $('#modal-overlay').addEventListener('click', (e) => {
        if (e.target === $('#modal-overlay')) $('#modal-overlay').classList.remove('visible');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SALES HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// SALES HISTORY, ANALYTICS & CHARTS
// ═══════════════════════════════════════════════════════════════════════════════

// Holds the full sales array and Chart.js instances
let allSales = [];
let dailyChartInstance = null;
let productsChartInstance = null;

/** Load analytics KPI cards and charts from /api/analytics */
async function loadAnalytics() {
    try {
        const res = await fetch('/api/analytics');
        const data = await res.json();

        // KPI cards
        $('#kpi-revenue').textContent = formatPrice(data.total_revenue);
        $('#kpi-sales').textContent   = data.total_sales;

        // Payment breakdown
        let cashCount = 0, mpesaCount = 0;
        data.payment_breakdown.forEach(p => {
            if (p.payment_method === 'Cash')   cashCount  = p.count;
            if (p.payment_method === 'M-Pesa') mpesaCount = p.count;
        });
        $('#kpi-cash').textContent  = cashCount;
        $('#kpi-mpesa').textContent = mpesaCount;

        // Charts
        renderDailyChart(data.daily_sales);
        renderProductsChart(data.best_sellers);
    } catch (err) {
        showToast('Failed to load analytics', 'error');
    }
}

/** Render line chart — daily revenue over last 30 days */
function renderDailyChart(dailySales) {
    const canvas = $('#chart-daily');
    const emptyEl = $('#chart-daily-empty');

    if (!dailySales || dailySales.length === 0) {
        canvas.style.display = 'none';
        emptyEl.style.display = 'flex';
        return;
    }
    canvas.style.display = 'block';
    emptyEl.style.display = 'none';

    const labels  = dailySales.map(d => d.day);
    const revenue = dailySales.map(d => d.revenue);

    // Destroy previous instance before re-rendering
    if (dailyChartInstance) dailyChartInstance.destroy();

    dailyChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Revenue (KSh)',
                data: revenue,
                borderColor: '#ffc107',
                backgroundColor: 'rgba(255,193,7,0.12)',
                borderWidth: 2,
                pointBackgroundColor: '#ffc107',
                pointRadius: 4,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => 'KSh ' + Number(ctx.parsed.y).toLocaleString('en-KE', {minimumFractionDigits:2})
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#636b7e', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: {
                    ticks: {
                        color: '#636b7e', font: { size: 11 },
                        callback: v => 'KSh ' + Number(v).toLocaleString('en-KE')
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    beginAtZero: true
                }
            }
        }
    });
}

/** Render bar chart — top selling products */
function renderProductsChart(bestSellers) {
    const canvas = $('#chart-products');
    const emptyEl = $('#chart-products-empty');

    if (!bestSellers || bestSellers.length === 0) {
        canvas.style.display = 'none';
        emptyEl.style.display = 'flex';
        return;
    }
    canvas.style.display = 'block';
    emptyEl.style.display = 'none';

    const labels = bestSellers.map(p => p.name);
    const qtys   = bestSellers.map(p => p.total_qty);

    if (productsChartInstance) productsChartInstance.destroy();

    productsChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Units Sold',
                data: qtys,
                backgroundColor: [
                    'rgba(255,193,7,0.75)', 'rgba(0,150,136,0.75)',
                    'rgba(66,165,245,0.75)', 'rgba(239,83,80,0.75)',
                    'rgba(171,71,188,0.75)'
                ],
                borderColor: [
                    '#ffc107', '#009688', '#42a5f5', '#ef5350', '#ab47bc'
                ],
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ctx.parsed.y + ' units sold' } }
            },
            scales: {
                x: { ticks: { color: '#636b7e', font: { size: 11 } }, grid: { display: false } },
                y: {
                    ticks: { color: '#636b7e', font: { size: 11 }, stepSize: 1 },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    beginAtZero: true
                }
            }
        }
    });
}

/** Load all sales and render the table */
async function loadSalesHistory() {
    try {
        const res = await fetch('/api/sales');
        allSales = await res.json();
        renderSalesTable(allSales);
        loadAnalytics();
    } catch (err) {
        showToast('Failed to load sales', 'error');
    }
}

/** Render sales into the table, applying current filters */
function renderSalesTable(sales) {
    const tbody   = $('#sales-table-body');
    const emptyEl = $('#sales-empty');
    const wrapper = $('#sales-table').closest('.table-wrapper');

    if (sales.length === 0) {
        tbody.innerHTML = '';
        wrapper.style.display = 'none';
        emptyEl.style.display = 'flex';
        return;
    }
    wrapper.style.display = 'block';
    emptyEl.style.display = 'none';

    tbody.innerHTML = sales.map(sale => {
        const pmClass = sale.payment_method === 'M-Pesa' ? 'pm-mpesa' : 'pm-cash';
        const itemCount = sale.items ? sale.items.length : 0;
        return `<tr>
            <td><strong>#${sale.id}</strong></td>
            <td>${escHtml(sale.date)}</td>
            <td><span class="item-count-badge">${itemCount} item${itemCount !== 1 ? 's' : ''}</span></td>
            <td><span class="pm-badge ${pmClass}">${escHtml(sale.payment_method || 'Cash')}</span></td>
            <td><strong style="color:var(--primary-400)">${formatPrice(sale.total_amount)}</strong></td>
            <td>
                <button class="btn-view-detail" onclick="openSaleDetail(${sale.id})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    View
                </button>
            </td>
        </tr>`;
    }).join('');
}

/** Apply search and filter on the cached allSales array — no network request */
function filterSales() {
    const search      = ($('#sales-search')?.value || '').toLowerCase();
    const pmFilter    = $('#sales-filter-payment')?.value || '';
    const dateFilter  = $('#sales-filter-date')?.value || '';

    const filtered = allSales.filter(s => {
        const matchSearch  = !search  || String(s.id).includes(search) || s.date.toLowerCase().includes(search);
        const matchPm      = !pmFilter    || s.payment_method === pmFilter;
        const matchDate    = !dateFilter  || s.date.startsWith(dateFilter);
        return matchSearch && matchPm && matchDate;
    });
    renderSalesTable(filtered);
}

/** Open the sale-detail modal for a given sale ID */
async function openSaleDetail(saleId) {
    try {
        const res  = await fetch(`/api/sales/${saleId}`);
        const sale = await res.json();
        if (!res.ok) throw new Error(sale.error);

        // Header
        $('#detail-title').textContent    = `Sale #${sale.id}`;
        $('#detail-subtitle').textContent = `${sale.date} · ${sale.payment_method}`;

        // Meta pills
        const pmClass = sale.payment_method === 'M-Pesa' ? 'pm-mpesa' : 'pm-cash';
        $('#detail-meta').innerHTML = `
            <span class="pm-badge ${pmClass}">${escHtml(sale.payment_method)}</span>
            <span class="detail-meta-pill">${sale.items.length} item${sale.items.length !== 1 ? 's' : ''}</span>
        `;

        // Items rows
        $('#detail-items-body').innerHTML = sale.items.map(i => `
            <tr>
                <td><strong>${escHtml(i.product_name)}</strong></td>
                <td>${escHtml(i.category || '-')}</td>
                <td style="text-align:center">${i.quantity}</td>
                <td>${formatPrice(i.price)}</td>
                <td><strong style="color:var(--primary-400)">${formatPrice(i.price * i.quantity)}</strong></td>
            </tr>
        `).join('');

        $('#detail-total').textContent = formatPrice(sale.total_amount);
        $('#detail-modal-overlay').classList.add('visible');
    } catch (err) {
        showToast('Could not load sale details', 'error');
    }
}

/** Init sale detail modal close buttons */
function initDetailModal() {
    const close = () => $('#detail-modal-overlay').classList.remove('visible');
    $('#btn-detail-close').addEventListener('click', close);
    $('#btn-detail-close2').addEventListener('click', close);
    $('#detail-modal-overlay').addEventListener('click', e => {
        if (e.target === $('#detail-modal-overlay')) close();
    });
}

/** Init search and filter listeners on the sales table */
function initSalesFilters() {
    $('#sales-search')?.addEventListener('input', filterSales);
    $('#sales-filter-payment')?.addEventListener('change', filterSales);
    $('#sales-filter-date')?.addEventListener('change', filterSales);
    $('#btn-clear-filters')?.addEventListener('click', () => {
        if ($('#sales-search'))         $('#sales-search').value = '';
        if ($('#sales-filter-payment')) $('#sales-filter-payment').value = '';
        if ($('#sales-filter-date'))    $('#sales-filter-date').value = '';
        renderSalesTable(allSales);
    });
    $('#btn-refresh-sales')?.addEventListener('click', loadSalesHistory);
}

// ═══════════════════════════════════════════════════════════════════════════════
// USERS MANAGEMENT (ADMIN ONLY)
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchUsers() {
    try {
        const res = await fetch('/api/users');
        users = await res.json();
        return users;
    } catch (err) {
        showToast('Failed to load users', 'error');
        return [];
    }
}

async function saveUser(data) {
    try {
        const res = await fetch('/api/users', {
            method: 'POST',
            body: data
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        showToast('User created successfully!');
        $('#user-form').reset();
        await fetchUsers();
        loadUsersTable();
    } catch (err) {
        showToast(err.message || 'Failed to create user', 'error');
    }
}

async function deleteUser(id) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
        const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        showToast('User deleted');
        await fetchUsers();
        loadUsersTable();
    } catch (err) {
        showToast(err.message || 'Failed to delete user', 'error');
    }
}

async function updateUserStatus(id, status) {
    if (!confirm(`Are you sure you want to change this user's status to ${status}?`)) return;
    try {
        const res = await fetch(`/api/users/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        showToast(result.message);
        await fetchUsers();
        loadUsersTable();
    } catch (err) {
        showToast(err.message || 'Failed to update user status', 'error');
    }
}

function initUserForm() {
    $('#user-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = new FormData();
        data.append('username', $('#user-username').value.trim());
        data.append('password', $('#user-password').value);
        data.append('role', $('#user-role').value);
        data.append('phone', $('#user-phone').value.trim());
        data.append('id_number', $('#user-id-number').value.trim());
        
        const fileInput = $('#user-photo');
        if (fileInput && fileInput.files[0]) {
            data.append('photo', fileInput.files[0]);
        }
        
        saveUser(data);
    });
}

function loadUsersTable() {
    const tbody = $('#users-table-body');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(u => {
        const status = u.status || 'active';
        let statusBadge = 'in-stock';
        if (status === 'suspended') statusBadge = 'low-stock';
        if (status === 'revoked') statusBadge = 'out-of-stock';
        
        let actionButtons = '';
        if (u.username !== window.USER?.username && window.USER?.role === 'admin') {
            if (status === 'active') {
                actionButtons += `<button class="btn-secondary btn-sm" onclick="updateUserStatus(${u.id}, 'suspended')" title="Suspend User" style="margin-right: 0.5rem; padding: 0.3rem 0.6rem; border-radius:4px;">Suspend</button>`;
            } else if (status === 'suspended') {
                actionButtons += `<button class="btn-primary btn-sm" onclick="updateUserStatus(${u.id}, 'active')" title="Activate User" style="margin-right: 0.5rem; padding: 0.3rem 0.6rem; border-radius:4px;">Activate</button>`;
                actionButtons += `<button class="btn-secondary btn-sm" onclick="updateUserStatus(${u.id}, 'revoked')" title="Revoke Access" style="margin-right: 0.5rem; padding: 0.3rem 0.6rem; border-radius:4px; color:var(--danger-500); border-color:var(--danger-500);">Revoke</button>`;
            } else if (status === 'revoked') {
                actionButtons += `<button class="btn-primary btn-sm" onclick="updateUserStatus(${u.id}, 'active')" title="Restore Access" style="margin-right: 0.5rem; padding: 0.3rem 0.6rem; border-radius:4px;">Restore</button>`;
            }
            
            actionButtons += `
                <button class="btn-delete" onclick="deleteUser(${u.id})" title="Delete Completely">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2-2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            `;
        }

        return `
            <tr>
                <td>#${u.id}</td>
                <td><img src="/static/uploads/${u.photo || 'default.png'}" class="avatar avatar-sm" onerror="this.src='/static/uploads/default.png'"></td>
                <td><strong>${escHtml(u.username)}</strong></td>
                <td>${escHtml(u.phone || '-')}</td>
                <td>${escHtml(u.id_number || '-')}</td>
                <td><span class="stock-badge ${u.role === 'admin' ? 'in-stock' : 'pm-cash'}">${u.role.toUpperCase()}</span></td>
                <td><span class="stock-badge ${statusBadge}">${status.toUpperCase()}</span></td>
                <td><div style="display:flex; align-items:center; gap: 0.5rem;">${actionButtons}</div></td>
            </tr>
        `;
    }).join('');
}

// ─── Profile Logic ─────────────────────────────────────────────────────────────

function initProfileModal() {
    $('#btn-my-profile')?.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/users/profile');
            const data = await res.json();
            if(!res.ok) throw new Error(data.error);
            $('#profile-phone').value = data.phone || '';
            $('#profile-id-number').value = data.id_number || '';
            
            if ($('#profile-photo-preview')) {
                $('#profile-photo-preview').src = data.photo ? `/static/uploads/${data.photo}` : '/static/uploads/default.png';
            }
            $('#profile-modal-overlay').classList.add('visible');
        } catch(err) {
            showToast(err.message || 'Failed to load profile', 'error');
        }
    });

    $('#profile-cancel')?.addEventListener('click', () => {
        $('#profile-modal-overlay').classList.remove('visible');
    });

    $('#profile-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData();
        data.append('phone', $('#profile-phone').value.trim());
        data.append('id_number', $('#profile-id-number').value.trim());
        
        const photoFile = $('#profile-photo').files[0];
        if (photoFile) {
            data.append('photo', photoFile);
        }

        try {
            const res = await fetch('/api/users/profile', {
                method: 'PUT',
                body: data
            });
            const result = await res.json();
            if(!res.ok) throw new Error(result.error);
            showToast(result.message);
            $('#profile-modal-overlay').classList.remove('visible');
            
            // update header instantly
            if (photoFile) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const headerImg = $('#header-avatar');
                    if(headerImg) headerImg.src = e.target.result;
                }
                reader.readAsDataURL(photoFile);
            }
            
            // If they are an admin and currently on the users tab, refresh the table so they see their own updates
            if (window.USER?.role === 'admin' && $('.nav-tab.active')?.dataset.tab === 'users') {
                await fetchUsers();
                loadUsersTable();
            }
        } catch(err) {
            showToast(err.message || 'Failed to save profile', 'error');
        }
    });

    $('#profile-modal-overlay')?.addEventListener('click', (e) => {
        if (e.target === $('#profile-modal-overlay')) {
            $('#profile-modal-overlay').classList.remove('visible');
        }
    });
}

// ─── RBAC Initialization ───────────────────────────────────────────────────────
function initRBAC() {
    if (!window.USER) return;

    if (window.USER.role === 'admin') {
        $$('.admin-only').forEach(el => el.style.display = 'flex');
    } else {
        $$('.admin-only').forEach(el => el.remove());
        // If cashier is on a restricted tab, move to POS
        const activeTab = $('.nav-tab.active')?.dataset.tab;
        if (activeTab === 'products' || activeTab === 'users') {
             $('#nav-pos').click();
        }
    }
}


// ─── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
    $('#stat-products').textContent = products.length;
    $('#stat-cart').textContent = cart.reduce((s, i) => s + i.quantity, 0);
}

// ─── HTML escape ───────────────────────────────────────────────────────────────
function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── Search listeners ──────────────────────────────────────────────────────────
function initSearch() {
    $('#pos-search')?.addEventListener('input', renderPOSGrid);
    $('#product-table-search')?.addEventListener('input', loadProductsTable);
}

// ─── Password Toggle ──────────────────────────────────────────────────────────
function initPasswordToggles() {
    $$('.btn-toggle-password').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const inputId = btn.dataset.target;
            const input = document.getElementById(inputId);
            const svg = btn.querySelector('svg');

            if (!input || !svg) return;

            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';

            // Toggle icon path
            if (isPassword) {
                svg.innerHTML = `
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                `;
            } else {
                svg.innerHTML = `
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                `;
            }
        });
    });
}


// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    initRBAC();
    initTabs();
    initProductForm();
    initUserForm();
    initQtyModal();
    initSaleModal();
    initDetailModal();
    initSalesFilters();
    initSearch();
    initPasswordToggles();
    initPaymentMethod();
    initProfileModal();


    $('#btn-pay').addEventListener('click', processSale);
    $('#btn-clear-cart').addEventListener('click', clearCart);

    // Initial data load
    await fetchProducts();
    if (window.USER && window.USER.role === 'admin') {
        await fetchUsers();
    }
    renderPOSGrid();
    renderCategoryFilters();
    updateStats();
});
