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
            
            // Close mobile menu if open
            if ($('#main-nav')) {
                $('#main-nav').classList.remove('open');
            }

            // Refresh data when switching tabs
            if (tab.dataset.tab === 'products') loadProductsTable();
            if (tab.dataset.tab === 'sales') loadSalesHistory();
            if (tab.dataset.tab === 'pos') renderPOSGrid();
            if (tab.dataset.tab === 'stock') loadStockTracking();
            if (tab.dataset.tab === 'monthly') loadMonthlyAnalytics();
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
            cost_price: parseFloat($('#product-price').value),
            stock: parseInt($('#product-stock').value)
        };
        if (!data.name || !data.category || isNaN(data.cost_price) || isNaN(data.stock)) {
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
    $('#product-price').value = product.cost_price || 0;
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
            <td>${formatPrice(p.cost_price || 0)}</td>
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
                <div class="pos-card-price">${formatPrice(p.cost_price || 0)}</div>
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
    $('#qty-modal-info').textContent = `${formatPrice(product.cost_price || 0)} · ${product.stock} in stock`;
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
        cart.push({ 
            product_id: productId, 
            name: product.name, 
            price: product.cost_price || 0, // Start with buying price (cost_price)
            retail_price: product.price, // Original retail price
            cost_price: product.cost_price || 0,
            quantity 
        });
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
    $('#total-selling-price').value = ''; // Clear selling price input
    renderCart();
    showToast('Cart cleared');
}

function getCartTotal() {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function renderCart() {
    const container = $('#cart-items');
    const payBtn = $('#btn-pay');

    updateStats();

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="cart-empty" id="cart-empty" style="display:flex;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                <p>Cart is empty</p>
                <span>Click on products to add them</span>
            </div>
        `;
        payBtn.disabled = true;
        
        // Safely update cart total if element exists
        const cartTotalEl = $('#cart-total');
        if (cartTotalEl) {
            cartTotalEl.textContent = 'KSh 0.00';
        }
        
        // Reset cart footer elements if they exist
        const buyingTotalEl = $('#cart-buying-total');
        const profitAmountEl = $('#profit-amount');
        const sellingPriceInput = $('#total-selling-price');
        
        if (buyingTotalEl) buyingTotalEl.textContent = 'KSh 0.00';
        if (profitAmountEl) {
            profitAmountEl.textContent = 'KSh 0.00';
            profitAmountEl.className = 'profit-amount';
        }
        if (sellingPriceInput) sellingPriceInput.value = '';
        
        return;
    }

    payBtn.disabled = false;
    
    // Update cart totals and profit/loss
    updateCartTotals();

    container.innerHTML = cart.map(item => `
        <div class="cart-item" data-id="${item.product_id}">
            <div class="cart-item-info">
                <div class="cart-item-name">${escHtml(item.name)}</div>
                <div class="cart-item-details">
                    <span class="cart-buying-price">Buying: ${formatPrice(item.cost_price)}</span>
                    <span class="cart-qty-info">Qty: ${item.quantity}</span>
                </div>
            </div>
            <div class="cart-item-qty">
                <button onclick="updateCartQty(${item.product_id}, -1)">−</button>
                <span>${item.quantity}</span>
                <button onclick="updateCartQty(${item.product_id}, 1)">+</button>
            </div>
            <div class="cart-item-subtotal">${formatPrice(item.cost_price * item.quantity)}</div>
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
    
    // Get total selling price from input
    const totalSellingPrice = parseFloat($('#total-selling-price').value) || 0;
    if (totalSellingPrice <= 0) {
        showToast('Please enter a valid selling price', 'warning');
        return;
    }
    
    // Calculate total buying price
    const totalBuyingPrice = cart.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0);
    
    // Distribute selling price proportionally based on buying price
    const cartSnapshot = cart.map(item => {
        const itemBuyingTotal = item.cost_price * item.quantity;
        const proportion = itemBuyingTotal / totalBuyingPrice;
        const itemSellingTotal = totalSellingPrice * proportion;
        const itemSellingPrice = itemSellingTotal / item.quantity;
        
        return {
            ...item,
            price: itemSellingPrice // Update price to distributed selling price
        };
    });

    const saleData = {
        items: cartSnapshot.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price
        })),
        total_amount: totalSellingPrice,
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

        // Show success message instead of receipt
        showToast(`Sale #${result.sale_id} recorded successfully! Total: ${formatPrice(totalSellingPrice)}`, 'success');

        // Clear cart and refresh products
        cart = [];
        $('#total-selling-price').value = ''; // Clear selling price input
        renderCart();
        await fetchProducts();
        renderPOSGrid();
        renderCategoryFilters();
        
        // Re-enable pay button
        payBtn.disabled = false;
        payBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Record`;
        
    } catch (err) {
        showToast(err.message || 'Sale failed', 'error');
        payBtn.disabled = false;
        payBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Record`;
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

        // Calculate totals from sales data (same as transaction history)
        const salesRes = await fetch('/api/sales');
        const salesData = await salesRes.json();
        
        let totalBuyingPrice = 0;
        let totalSellingPrice = 0;
        let totalProfit = 0;
        let totalLoss = 0;
        
        salesData.forEach(sale => {
            if (sale.items) {
                let saleBuyingPrice = 0;
                let saleSellingPrice = 0;
                
                sale.items.forEach(item => {
                    saleBuyingPrice += (item.cost_price || 0) * item.quantity;
                    saleSellingPrice += item.price * item.quantity;
                });
                
                totalBuyingPrice += saleBuyingPrice;
                totalSellingPrice += saleSellingPrice;
                
                const profitLoss = saleSellingPrice - saleBuyingPrice;
                if (profitLoss >= 0) {
                    totalProfit += profitLoss;
                } else {
                    totalLoss += Math.abs(profitLoss);
                }
            }
        });

        // KPI cards - using calculated values that match transaction history
        $('#kpi-revenue').textContent = formatPrice(totalSellingPrice); // Total selling price
        $('#kpi-sales').textContent = data.count;
        
        // Show total profit or total loss
        const netProfitLoss = totalProfit - totalLoss;
        $('#kpi-gross-profit').textContent = (netProfitLoss >= 0 ? '' : '-') + formatPrice(Math.abs(netProfitLoss));
        $('#kpi-discount-loss').textContent = formatPrice(totalLoss);

        // Apply color classes to Total Profit
        const grossProfitEl = $('#kpi-gross-profit');
        grossProfitEl.classList.remove('text-profit', 'text-loss');
        grossProfitEl.classList.add(netProfitLoss >= 0 ? 'text-profit' : 'text-loss');

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
        renderProfitDailyChart(data.daily_sales);
        renderProfitProductsChart(data.best_sellers);
    } catch (err) {
        showToast('Failed to load analytics', 'error');
    }
}

/** Render line chart — daily profit over last 30 days */
let profitDailyChartInstance = null;
function renderProfitDailyChart(dailySales) {
    const canvas = $('#chart-profit-daily');
    const emptyEl = $('#chart-profit-daily-empty');

    if (!dailySales || dailySales.length === 0) {
        canvas.style.display = 'none';
        emptyEl.style.display = 'flex';
        return;
    }
    canvas.style.display = 'block';
    emptyEl.style.display = 'none';

    const labels  = dailySales.map(d => d.day);
    const profits = dailySales.map(d => d.total_profit);

    if (profitDailyChartInstance) profitDailyChartInstance.destroy();

    profitDailyChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Profit (KSh)',
                data: profits,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.12)',
                borderWidth: 2,
                pointBackgroundColor: '#10b981',
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
                        label: ctx => 'Profit: KSh ' + Number(ctx.parsed.y).toLocaleString('en-KE', {minimumFractionDigits:2})
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

/** Render bar chart — profit per product */
let profitProductsChartInstance = null;
function renderProfitProductsChart(bestSellers) {
    const canvas = $('#chart-profit-products');
    const emptyEl = $('#chart-profit-products-empty');

    if (!bestSellers || bestSellers.length === 0) {
        canvas.style.display = 'none';
        emptyEl.style.display = 'flex';
        return;
    }
    canvas.style.display = 'block';
    emptyEl.style.display = 'none';

    const labels = bestSellers.map(p => p.name);
    const profits = bestSellers.map(p => p.product_profit);

    if (profitProductsChartInstance) profitProductsChartInstance.destroy();

    profitProductsChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Profit (KSh)',
                data: profits,
                backgroundColor: 'rgba(16,185,129,0.75)',
                borderColor: '#10b981',
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => 'Profit: KSh ' + Number(ctx.parsed.y).toLocaleString('en-KE') } }
            },
            scales: {
                x: { ticks: { color: '#636b7e', font: { size: 11 } }, grid: { display: false } },
                y: {
                    ticks: { color: '#636b7e', font: { size: 11 }, callback: v => 'KSh ' + Number(v).toLocaleString('en-KE') },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    beginAtZero: true
                }
            }
        }
    });
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
        
        // Calculate total buying price and selling price
        let totalBuyingPrice = 0;
        let totalSellingPrice = 0;
        if (sale.items) {
            sale.items.forEach(item => {
                totalBuyingPrice += (item.cost_price || 0) * item.quantity;
                totalSellingPrice += item.price * item.quantity;
            });
        }
        
        // Calculate profit or loss
        const profitLoss = totalSellingPrice - totalBuyingPrice;
        const profitLossClass = profitLoss >= 0 ? 'text-profit' : 'text-loss';
        const profitLossText = profitLoss >= 0 ? 'Profit: ' : 'Loss: -';
        
        return `<tr>
            <td><strong>#${sale.id}</strong></td>
            <td>${escHtml(sale.date)}</td>
            <td><span class="item-count-badge">${itemCount} item${itemCount !== 1 ? 's' : ''}</span></td>
            <td><span class="pm-badge ${pmClass}">${escHtml(sale.payment_method || 'Cash')}</span></td>
            <td><strong style="color:var(--text-muted)">${formatPrice(totalBuyingPrice)}</strong></td>
            <td><strong style="color:var(--primary-400)">${formatPrice(totalSellingPrice)}</strong></td>
            <td><span class="${profitLossClass}">${profitLossText}${formatPrice(Math.abs(profitLoss))}</span></td>
            <td>
                <button class="btn-view-detail" onclick="openSaleDetail(${sale.id})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    View
                </button>
                <button class="btn-delete-sale" onclick="deleteSale(${sale.id})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Delete
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
        $('#detail-items-body').innerHTML = sale.items.map(i => {
            const profit = (i.profit_per_item || 0) * i.quantity;
            const profitClass = profit >= 0 ? 'text-profit' : 'text-loss';
            return `
            <tr>
                <td><strong>${escHtml(i.product_name)}</strong></td>
                <td>${escHtml(i.category || '-')}</td>
                <td style="text-align:center">${i.quantity}</td>
                <td>${formatPrice(i.cost_price || 0)}</td>
                <td>${formatPrice(i.price)}</td>
                <td class="${profitClass}">${profit >= 0 ? '' : '-'}${formatPrice(Math.abs(profit))}</td>
                <td><strong style="color:var(--primary-400)">${formatPrice(i.price * i.quantity)}</strong></td>
            </tr>
            `;
        }).join('');

        const totalProfit = sale.items.reduce((sum, i) => sum + ((i.profit_per_item || 0) * i.quantity), 0);
        const totalProfitClass = totalProfit >= 0 ? 'text-profit' : 'text-loss';
        
        // Add Total Profit to Modal
        const totalRow = $('#detail-items-table').closest('.table-wrapper').nextElementSibling;
        if (totalRow) {
            totalRow.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:flex-end;">
                    <div style="font-size:0.9rem; color:var(--text-muted);">Total Profit: <span class="${totalProfitClass}">${totalProfit >= 0 ? '' : '-'}${formatPrice(Math.abs(totalProfit))}</span></div>
                    <div style="margin-top:0.3rem;">Grand Total: <span id="detail-total" class="detail-grand-total">${formatPrice(sale.total_amount)}</span></div>
                </div>
            `;
        }

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


// ─── Mobile Menu ───────────────────────────────────────────────────────────────
function initMobileMenu() {
    $('#btn-main-menu')?.addEventListener('click', () => {
        $('#main-nav')?.classList.toggle('open');
    });
    $('#btn-my-profile-mobile')?.addEventListener('click', () => {
        $('#main-nav')?.classList.remove('open');
        $('#btn-my-profile')?.click();
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
    initMobileMenu();
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


/** Delete a sale record and refresh UI */
async function deleteSale(saleId) {
    if (!confirm(`Are you sure you want to delete Sale #${saleId}? This will restore the product stock and remove the transaction permanently.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/sales/${saleId}`, {
            method: 'DELETE'
        });
        const data = await res.json();

        if (res.ok) {
            showToast(data.message, 'success');
            loadSalesHistory(); 
        } else {
            showToast(data.error || 'Failed to delete sale', 'error');
        }
    } catch (err) {
        showToast('Connection error while deleting sale', 'error');
    }
}

// ─── Monthly Profit Analytics ──────────────────────────────────────────────────
let monthlyProfitChartInstance = null;

async function loadMonthlyAnalytics() {
    try {
        // Get all sales data to calculate monthly totals
        const salesRes = await fetch('/api/sales');
        const salesData = await salesRes.json();
        
        // Group sales by month and calculate totals
        const monthlyData = {};
        
        salesData.forEach(sale => {
            const saleDate = new Date(sale.date);
            const monthKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
            
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = {
                    month: monthKey,
                    count: 0,
                    totalBuyingPrice: 0,
                    totalSellingPrice: 0,
                    totalProfit: 0,
                    totalLoss: 0
                };
            }
            
            monthlyData[monthKey].count++;
            
            if (sale.items) {
                let saleBuyingPrice = 0;
                let saleSellingPrice = 0;
                
                sale.items.forEach(item => {
                    saleBuyingPrice += (item.cost_price || 0) * item.quantity;
                    saleSellingPrice += item.price * item.quantity;
                });
                
                monthlyData[monthKey].totalBuyingPrice += saleBuyingPrice;
                monthlyData[monthKey].totalSellingPrice += saleSellingPrice;
                
                const profitLoss = saleSellingPrice - saleBuyingPrice;
                if (profitLoss >= 0) {
                    monthlyData[monthKey].totalProfit += profitLoss;
                } else {
                    monthlyData[monthKey].totalLoss += Math.abs(profitLoss);
                }
            }
        });
        
        // Convert to array and sort by month (newest first)
        const monthlySales = Object.values(monthlyData).sort((a, b) => b.month.localeCompare(a.month));
        
        // 1. Render Table
        const tbody = $('#monthly-table-body');
        const emptyEl = $('#monthly-empty');
        if (monthlySales.length === 0) {
            tbody.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'flex';
            if($('#monthly-table')) $('#monthly-table').closest('.table-wrapper').style.display = 'none';
        } else {
            if (emptyEl) emptyEl.style.display = 'none';
            if($('#monthly-table')) $('#monthly-table').closest('.table-wrapper').style.display = 'block';
            tbody.innerHTML = monthlySales.map(m => {
                const netProfitLoss = m.totalProfit - m.totalLoss;
                const profitLossClass = netProfitLoss >= 0 ? 'text-profit' : 'text-loss';
                const profitLossText = netProfitLoss >= 0 ? 'Profit: ' : 'Loss: -';
                
                return `
                <tr>
                    <td><strong>${m.month}</strong></td>
                    <td>${m.count}</td>
                    <td>${formatPrice(m.totalSellingPrice)}</td>
                    <td>${formatPrice(m.totalBuyingPrice)}</td>
                    <td class="${profitLossClass}">${profitLossText}${formatPrice(Math.abs(netProfitLoss))}</td>
                </tr>
                `;
            }).join('');
        }
        
        // 2. Render KPI Cards for current month
        const currentMonth = monthlySales[0] || { 
            month: 'Current', 
            count: 0, 
            totalSellingPrice: 0, 
            totalBuyingPrice: 0, 
            totalProfit: 0, 
            totalLoss: 0 
        };
        const currentNetProfit = currentMonth.totalProfit - currentMonth.totalLoss;
        
        const kpiRow = $('#monthly-kpi-row');
        if (kpiRow) {
            kpiRow.innerHTML = `
                <div class="kpi-card">
                    <div class="kpi-icon kpi-revenue">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </div>
                    <div class="kpi-info">
                        <span class="kpi-label">Revenue (${currentMonth.month})</span>
                        <span class="kpi-value">${formatPrice(currentMonth.totalSellingPrice)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon kpi-profit" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22m5-18H7c-1.5 0-3 1.2-3 2.5S5.5 10 7 10h10c1.5 0 3 1.2 3 2.5S18.5 15 17 15H7m5-14v14"/></svg>
                    </div>
                    <div class="kpi-info">
                        <span class="kpi-label">Month Net Profit</span>
                        <span class="kpi-value ${currentNetProfit >= 0 ? 'text-profit' : 'text-loss'}">${currentNetProfit >= 0 ? '' : '-'}${formatPrice(Math.abs(currentNetProfit))}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-icon kpi-sales">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    </div>
                    <div class="kpi-info">
                        <span class="kpi-label">Month Sales</span>
                        <span class="kpi-value">${currentMonth.count}</span>
                    </div>
                </div>
            `;
        }
        
        // 3. Render Chart
        renderMonthlyProfitChart(monthlySales);
        
    } catch (err) {
        console.error('Monthly analytics error:', err);
        showToast('Failed to load monthly analytics', 'error');
    }
}

function renderMonthlyProfitChart(monthlySales) {
    const canvas = $('#chart-monthly-profit');
    if (!canvas) return;
    
    // Reverse for chronological order in chart
    const chartData = [...monthlySales].reverse();
    const labels = chartData.map(m => m.month);
    const profits = chartData.map(m => m.totalProfit - m.totalLoss); // Net profit/loss
    const revenues = chartData.map(m => m.totalSellingPrice); // Total selling price
    
    if (monthlyProfitChartInstance) monthlyProfitChartInstance.destroy();
    
    monthlyProfitChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Net Profit/Loss (KSh)',
                    data: profits,
                    backgroundColor: profits.map(p => p >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 83, 80, 0.7)'),
                    borderColor: profits.map(p => p >= 0 ? '#10b981' : '#ef5350'),
                    borderWidth: 1,
                    borderRadius: 4,
                    order: 2
                },
                {
                    label: 'Total Revenue (KSh)',
                    data: revenues,
                    type: 'line',
                    borderColor: '#ffc107',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    borderWidth: 2,
                    pointRadius: 4,
                    tension: 0.3,
                    fill: false,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#f0f1f5' }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ctx.dataset.label + ': ' + formatPrice(ctx.parsed.y)
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#636b7e' }, grid: { display: false } },
                y: { 
                    ticks: { color: '#636b7e', callback: v => 'KSh ' + Number(v).toLocaleString() },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    beginAtZero: true
                }
            }
        }
    });
}

// ─── Stock Tracking ────────────────────────────────────────────────────────────

let allStockData = [];

async function loadStockTracking() {
    try {
        const res = await fetch('/api/stock-tracking');
        const data = await res.json();
        
        allStockData = data.products || [];
        
        // Update KPI cards
        $('#stock-total-products').textContent = data.summary.total_products;
        $('#stock-total-initial').textContent = data.summary.total_initial;
        $('#stock-total-sold').textContent = data.summary.total_sold;
        $('#stock-total-remaining').textContent = data.summary.total_remaining;
        
        // Populate category filter
        const categories = [...new Set(allStockData.map(p => p.category))].sort();
        const categoryFilter = $('#stock-filter-category');
        categoryFilter.innerHTML = '<option value="">All Categories</option>' + 
            categories.map(cat => `<option value="${escHtml(cat)}">${escHtml(cat)}</option>`).join('');
        
        // Render table
        renderStockTable(allStockData);
        
    } catch (err) {
        showToast('Failed to load stock tracking data', 'error');
        console.error(err);
    }
}

function renderStockTable(stockData) {
    const tbody = $('#stock-table-body');
    const emptyEl = $('#stock-empty');
    const wrapper = $('#stock-table').closest('.table-wrapper');

    if (stockData.length === 0) {
        tbody.innerHTML = '';
        wrapper.style.display = 'none';
        emptyEl.style.display = 'flex';
        return;
    }
    
    wrapper.style.display = 'block';
    emptyEl.style.display = 'none';

    tbody.innerHTML = stockData.map(product => {
        return `<tr>
            <td><strong>${escHtml(product.name)}</strong></td>
            <td><span class="category-badge">${escHtml(product.category)}</span></td>
            <td><span class="stock-initial">${product.initial_stock}</span></td>
            <td><span class="stock-sold">${product.sold_quantity}</span></td>
            <td><span class="stock-remaining">${product.current_stock}</span></td>
            <td><span class="stock-badge ${product.status_class}">${product.status_label}</span></td>
        </tr>`;
    }).join('');
}

function filterStockData() {
    const search = ($('#stock-search')?.value || '').toLowerCase();
    const categoryFilter = $('#stock-filter-category')?.value || '';
    const statusFilter = $('#stock-filter-status')?.value || '';

    const filtered = allStockData.filter(product => {
        const matchSearch = product.name.toLowerCase().includes(search) || 
                          product.category.toLowerCase().includes(search);
        const matchCategory = !categoryFilter || product.category === categoryFilter;
        const matchStatus = !statusFilter || product.stock_status === statusFilter;
        
        return matchSearch && matchCategory && matchStatus;
    });
    
    renderStockTable(filtered);
}

// Initialize stock tracking event listeners
function initStockTracking() {
    $('#stock-search')?.addEventListener('input', filterStockData);
    $('#stock-filter-category')?.addEventListener('change', filterStockData);
    $('#stock-filter-status')?.addEventListener('change', filterStockData);
    
    $('#btn-clear-stock-filters')?.addEventListener('click', () => {
        if ($('#stock-search')) $('#stock-search').value = '';
        if ($('#stock-filter-category')) $('#stock-filter-category').value = '';
        if ($('#stock-filter-status')) $('#stock-filter-status').value = '';
        renderStockTable(allStockData);
    });
    
    $('#btn-refresh-stock')?.addEventListener('click', loadStockTracking);
}

// Add to initialization
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    initStockTracking();
});

// ─── Total Selling Price Functions ─────────────────────────────────────────────

function updateCartTotals() {
    const totalBuying = cart.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0);
    const buyingTotalEl = $('#cart-buying-total');
    if (buyingTotalEl) {
        buyingTotalEl.textContent = formatPrice(totalBuying);
    }
    
    // Update profit/loss when selling price changes
    updateTotalProfit();
}

function updateTotalProfit() {
    const totalBuying = cart.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0);
    const sellingPriceInput = $('#total-selling-price');
    const profitAmountEl = $('#profit-amount');
    const payBtn = $('#btn-pay');
    
    // Check if elements exist before updating them
    if (!sellingPriceInput || !profitAmountEl || !payBtn) {
        return;
    }
    
    const totalSelling = parseFloat(sellingPriceInput.value) || 0;
    const profitLoss = totalSelling - totalBuying;
    
    if (totalSelling === 0) {
        profitAmountEl.textContent = 'KSh 0.00';
        profitAmountEl.className = 'profit-amount';
    } else if (profitLoss >= 0) {
        profitAmountEl.textContent = formatPrice(profitLoss);
        profitAmountEl.className = 'profit-amount text-profit';
    } else {
        profitAmountEl.textContent = '-' + formatPrice(Math.abs(profitLoss));
        profitAmountEl.className = 'profit-amount text-loss';
    }
    
    // Enable/disable pay button
    payBtn.disabled = cart.length === 0 || totalSelling <= 0;
}