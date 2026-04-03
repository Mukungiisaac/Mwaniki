"""
Mwaniki Furnitures - Point of Sale System
Main Flask application with API routes for product management and sales processing.
"""

import sqlite3
import os
from datetime import datetime
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mwaniki_pos.db')


# ─── Database Helpers ───────────────────────────────────────────────────────────

def get_db():
    """Create a database connection and return it."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row  # Return rows as dictionaries
    conn.execute("PRAGMA foreign_keys = ON")  # Enable foreign key support
    return conn


def init_db():
    """Initialize the database with required tables."""
    conn = get_db()
    cursor = conn.cursor()

    # Products table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            stock INTEGER NOT NULL DEFAULT 0
        )
    ''')

    # Sales table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            total_amount REAL NOT NULL,
            payment_method TEXT NOT NULL DEFAULT 'Cash',
            date TEXT NOT NULL
        )
    ''')

    # Migrate: add payment_method column if it doesn't exist (for existing databases)
    try:
        cursor.execute('ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT "Cash"')
    except Exception:
        pass  # Column already exists

    # Sale Items table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sale_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            FOREIGN KEY (sale_id) REFERENCES sales(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    ''')

    conn.commit()
    conn.close()


# ─── Page Routes ────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    """Serve the main POS interface."""
    return render_template('index.html')


# ─── Product API Routes ────────────────────────────────────────────────────────

@app.route('/api/products', methods=['GET'])
def get_products():
    """Fetch all products from the database."""
    conn = get_db()
    products = conn.execute('SELECT * FROM products ORDER BY id DESC').fetchall()
    conn.close()
    # Convert Row objects to dictionaries
    return jsonify([dict(p) for p in products])


@app.route('/api/products', methods=['POST'])
def add_product():
    """Add a new product to the database."""
    data = request.get_json()

    # Validate required fields
    if not all(k in data for k in ('name', 'category', 'price', 'stock')):
        return jsonify({'error': 'Missing required fields'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO products (name, category, price, stock) VALUES (?, ?, ?, ?)',
        (data['name'], data['category'], float(data['price']), int(data['stock']))
    )
    conn.commit()
    product_id = cursor.lastrowid
    conn.close()

    return jsonify({'id': product_id, 'message': 'Product added successfully'}), 201


@app.route('/api/products/<int:product_id>', methods=['PUT'])
def update_product(product_id):
    """Update an existing product."""
    data = request.get_json()

    conn = get_db()
    # Check if product exists
    product = conn.execute('SELECT * FROM products WHERE id = ?', (product_id,)).fetchone()
    if not product:
        conn.close()
        return jsonify({'error': 'Product not found'}), 404

    conn.execute(
        'UPDATE products SET name = ?, category = ?, price = ?, stock = ? WHERE id = ?',
        (data['name'], data['category'], float(data['price']), int(data['stock']), product_id)
    )
    conn.commit()
    conn.close()

    return jsonify({'message': 'Product updated successfully'})


@app.route('/api/products/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    """Delete a product from the database."""
    conn = get_db()
    product = conn.execute('SELECT * FROM products WHERE id = ?', (product_id,)).fetchone()
    if not product:
        conn.close()
        return jsonify({'error': 'Product not found'}), 404

    conn.execute('DELETE FROM products WHERE id = ?', (product_id,))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Product deleted successfully'})


# ─── Sales API Routes ──────────────────────────────────────────────────────────

@app.route('/api/sales', methods=['POST'])
def process_sale():
    """
    Process a sale: save to database and reduce stock.
    Expected JSON body:
    {
        "items": [
            {"product_id": 1, "quantity": 2, "price": 15000},
            ...
        ],
        "total_amount": 30000,
        "payment_method": "Cash"  # or "M-Pesa"
    }
    """
    data = request.get_json()
    items = data.get('items', [])
    total_amount = data.get('total_amount', 0)
    payment_method = data.get('payment_method', 'Cash')

    # Validate payment method
    if payment_method not in ('Cash', 'M-Pesa'):
        return jsonify({'error': 'Invalid payment method. Use Cash or M-Pesa'}), 400

    if not items:
        return jsonify({'error': 'No items in the sale'}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        # Check stock availability for all items first
        for item in items:
            product = conn.execute(
                'SELECT stock, name FROM products WHERE id = ?', (item['product_id'],)
            ).fetchone()

            if not product:
                return jsonify({'error': f'Product ID {item["product_id"]} not found'}), 404

            if product['stock'] < item['quantity']:
                return jsonify({
                    'error': f'Insufficient stock for "{product["name"]}". '
                             f'Available: {product["stock"]}, Requested: {item["quantity"]}'
                }), 400

        # Insert the sale record with payment method
        sale_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute(
            'INSERT INTO sales (total_amount, payment_method, date) VALUES (?, ?, ?)',
            (total_amount, payment_method, sale_date)
        )
        sale_id = cursor.lastrowid

        # Insert each sale item and reduce stock
        for item in items:
            cursor.execute(
                'INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                (sale_id, item['product_id'], item['quantity'], item['price'])
            )
            # Reduce stock
            cursor.execute(
                'UPDATE products SET stock = stock - ? WHERE id = ?',
                (item['quantity'], item['product_id'])
            )

        conn.commit()
        return jsonify({
            'message': 'Sale processed successfully',
            'sale_id': sale_id,
            'total': total_amount,
            'payment_method': payment_method,
            'date': sale_date
        }), 201

    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500

    finally:
        conn.close()


@app.route('/api/sales', methods=['GET'])
def get_sales():
    """Fetch all sales with their items."""
    conn = get_db()
    sales = conn.execute('SELECT * FROM sales ORDER BY id DESC').fetchall()
    result = []

    for sale in sales:
        sale_dict = dict(sale)
        sale_dict.setdefault('payment_method', 'Cash')
        items = conn.execute('''
            SELECT si.*, p.name as product_name
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
            WHERE si.sale_id = ?
        ''', (sale['id'],)).fetchall()
        sale_dict['items'] = [dict(i) for i in items]
        result.append(sale_dict)

    conn.close()
    return jsonify(result)


@app.route('/api/sales/<int:sale_id>', methods=['GET'])
def get_sale(sale_id):
    """Fetch a single sale with its items by ID."""
    conn = get_db()
    sale = conn.execute('SELECT * FROM sales WHERE id = ?', (sale_id,)).fetchone()
    if not sale:
        conn.close()
        return jsonify({'error': 'Sale not found'}), 404

    sale_dict = dict(sale)
    sale_dict.setdefault('payment_method', 'Cash')
    items = conn.execute('''
        SELECT si.*, p.name as product_name, p.category
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        WHERE si.sale_id = ?
    ''', (sale_id,)).fetchall()
    sale_dict['items'] = [dict(i) for i in items]
    conn.close()
    return jsonify(sale_dict)


@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    """
    Return dashboard analytics:
    - total_revenue: sum of all sales
    - total_sales: count of all sales
    - best_sellers: top 5 products by quantity sold
    - daily_sales: revenue and count grouped by date (last 30 days)
    - payment_breakdown: count per payment method
    """
    conn = get_db()

    # Total revenue and sales count
    summary = conn.execute(
        'SELECT COALESCE(SUM(total_amount), 0) as revenue, COUNT(*) as count FROM sales'
    ).fetchone()

    # Best-selling products (top 5 by total quantity sold)
    best_sellers = conn.execute('''
        SELECT p.name, SUM(si.quantity) as total_qty, SUM(si.quantity * si.price) as total_revenue
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        GROUP BY p.id, p.name
        ORDER BY total_qty DESC
        LIMIT 5
    ''').fetchall()

    # Daily sales for last 30 days
    daily_sales = conn.execute('''
        SELECT DATE(date) as day,
               SUM(total_amount) as revenue,
               COUNT(*) as count
        FROM sales
        WHERE date >= DATE('now', '-30 days')
        GROUP BY DATE(date)
        ORDER BY day ASC
    ''').fetchall()

    # Payment method breakdown
    payment_breakdown = conn.execute('''
        SELECT payment_method, COUNT(*) as count, SUM(total_amount) as total
        FROM sales
        GROUP BY payment_method
    ''').fetchall()

    conn.close()
    return jsonify({
        'total_revenue': summary['revenue'],
        'total_sales': summary['count'],
        'best_sellers': [dict(r) for r in best_sellers],
        'daily_sales': [dict(r) for r in daily_sales],
        'payment_breakdown': [dict(r) for r in payment_breakdown]
    })


# ─── Application Entry Point ───────────────────────────────────────────────────

if __name__ == '__main__':
    init_db()
    print("✦ Mwaniki Furnitures POS System is running...")
    print("✦ Open http://127.0.0.1:5000 in your browser")
    app.run(debug=True, port=5000)
