/**
 * @fileoverview Pizza Database Controller for Baba Pizza Ordering Service
 *
 * Handles all database operations for pizza orders with auto-reconnect pattern.
 * Follows the same connection management strategy as databaseVoiceController.js:
 * - Connects on-demand when SQL query needed
 * - Auto-disconnects after 60 seconds of inactivity
 * - Retry mechanism with 60-second cycles on failure
 *
 * @module databasePizzaController
 */

var babadata = require('../../babotdata.json');
const mysql = require('mysql2');
const { getD1 } = require('../../Tools/overrides.js');

var connection = null;
var timeoutCT = 0;
var to = null;

/**
 * Gets or creates MySQL connection for pizza operations
 * Implements on-demand connection with 60s auto-disconnect
 *
 * @returns {Object} MySQL connection object
 */
function getConnection() {
    if (connection == null) {
        connection = mysql.createConnection({
            host: babadata.database.host,
            user: babadata.database.user,
            password: babadata.database.password,
            database: babadata.database.database,
            port: babadata.database.port
        });

        connection.connect(function(err) {
            if (err) {
                console.log('Pizza DB connection failed: ' + err.stack, false, true);
                connection = null;
                timeoutCT++;

                if (timeoutCT > 1) {
                    console.log('Pizza DB retry attempt ' + timeoutCT, false, true);
                }
                return;
            }

            timeoutCT = 0;
            console.log('Pizza DB connected successfully', false, true);
        });
    }

    // Reset timeout - disconnect after 60s of inactivity
    if (to != null) {
        clearTimeout(to);
    }

    to = setTimeout(timeoutDisconnect, 60000);

    return connection;
}

/**
 * Disconnects from database after timeout period
 */
function timeoutDisconnect() {
    if (connection != null) {
        connection.end();
        connection = null;
        console.log('Pizza DB auto-disconnected after timeout', false, true);
    }
}

/**
 * SQL escape function for user input sanitization
 * Prevents SQL injection attacks
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function sqlEscape(str) {
    if (str == null) return 'NULL';
    return connection.escape(str);
}

/**
 * Creates a new pizza order in the database
 *
 * @param {Object} orderData - Order information
 * @param {string} orderData.OrderID - Unique order ID
 * @param {string} orderData.UserID - Discord user ID
 * @param {string} orderData.GuildID - Discord guild ID
 * @param {string} orderData.Size - Pizza size
 * @param {string} orderData.Crust - Crust type
 * @param {Array} orderData.Toppings - Array of topping names
 * @param {string} orderData.SpecialInstructions - Special instructions
 * @param {string} orderData.Address - Delivery address
 * @param {string} orderData.OrderStatus - Order status
 * @param {number} orderData.Price - Total price
 * @param {Date} orderData.EstimatedDelivery - Estimated delivery time
 * @param {string} orderData.DominosOrderID - External order ID
 * @param {boolean} orderData.IsMockOrder - Mock mode flag
 * @returns {Promise<boolean>} True if successful
 */
async function createPizzaOrder(orderData) {
    return new Promise((resolve, reject) => {
        if (!global.dbAccess[0] || !global.dbAccess[1]) {
            console.log('Pizza DB not available, skipping order creation', false, true);
            resolve(false);
            return;
        }

        const conn = getConnection();
        if (!conn) {
            resolve(false);
            return;
        }

        const now = getD1(true);
        const toppingsJson = JSON.stringify(orderData.Toppings || []);

        const sql = `INSERT INTO pizza_orders
            (OrderID, UserID, GuildID, OrderDate, Size, Crust, Toppings,
             SpecialInstructions, Address, OrderStatus, EstimatedDelivery,
             Price, DominosOrderID, IsMockOrder)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const params = [
            orderData.OrderID,
            orderData.UserID,
            orderData.GuildID,
            now,
            orderData.Size,
            orderData.Crust,
            toppingsJson,
            orderData.SpecialInstructions || null,
            orderData.Address || null,
            orderData.OrderStatus,
            orderData.EstimatedDelivery || null,
            orderData.Price,
            orderData.DominosOrderID || null,
            orderData.IsMockOrder !== false
        ];

        conn.query(sql, params, function(err, result) {
            if (err) {
                console.log('Error creating pizza order: ' + err.message, false, true);
                resolve(false);
                return;
            }

            console.log('Pizza order created: ' + orderData.OrderID, false, true);
            resolve(true);
        });
    });
}

/**
 * Updates pizza order status
 *
 * @param {string} orderID - Order ID to update
 * @param {string} newStatus - New status value
 * @returns {Promise<boolean>} True if successful
 */
async function updateOrderStatus(orderID, newStatus) {
    return new Promise((resolve, reject) => {
        if (!global.dbAccess[0] || !global.dbAccess[1]) {
            resolve(false);
            return;
        }

        const conn = getConnection();
        if (!conn) {
            resolve(false);
            return;
        }

        const sql = `UPDATE pizza_orders SET OrderStatus = ? WHERE OrderID = ?`;

        conn.query(sql, [newStatus, orderID], function(err, result) {
            if (err) {
                console.log('Error updating order status: ' + err.message, false, true);
                resolve(false);
                return;
            }

            resolve(true);
        });
    });
}

/**
 * Gets a single pizza order by ID
 *
 * @param {string} orderID - Order ID to retrieve
 * @returns {Promise<Object|null>} Order object or null if not found
 */
async function getOrderByID(orderID) {
    return new Promise((resolve, reject) => {
        if (!global.dbAccess[0] || !global.dbAccess[1]) {
            resolve(null);
            return;
        }

        const conn = getConnection();
        if (!conn) {
            resolve(null);
            return;
        }

        const sql = `SELECT * FROM pizza_orders WHERE OrderID = ?`;

        conn.query(sql, [orderID], function(err, results) {
            if (err) {
                console.log('Error getting order: ' + err.message, false, true);
                resolve(null);
                return;
            }

            if (results.length === 0) {
                resolve(null);
                return;
            }

            // Parse toppings JSON
            const order = results[0];
            try {
                order.Toppings = JSON.parse(order.Toppings || '[]');
            } catch (e) {
                order.Toppings = [];
            }

            resolve(order);
        });
    });
}

/**
 * Gets all orders for a specific user
 *
 * @param {string} userID - Discord user ID
 * @param {number} limit - Maximum number of orders to return
 * @returns {Promise<Array>} Array of order objects
 */
async function getUserOrders(userID, limit = 10) {
    return new Promise((resolve, reject) => {
        if (!global.dbAccess[0] || !global.dbAccess[1]) {
            resolve([]);
            return;
        }

        const conn = getConnection();
        if (!conn) {
            resolve([]);
            return;
        }

        const sql = `SELECT * FROM pizza_orders
                     WHERE UserID = ?
                     ORDER BY OrderDate DESC
                     LIMIT ?`;

        conn.query(sql, [userID, limit], function(err, results) {
            if (err) {
                console.log('Error getting user orders: ' + err.message, false, true);
                resolve([]);
                return;
            }

            // Parse toppings JSON for all orders
            results.forEach(order => {
                try {
                    order.Toppings = JSON.parse(order.Toppings || '[]');
                } catch (e) {
                    order.Toppings = [];
                }
            });

            resolve(results);
        });
    });
}

/**
 * Gets all active orders (not delivered or cancelled)
 *
 * @returns {Promise<Array>} Array of active order objects
 */
async function getActiveOrders() {
    return new Promise((resolve, reject) => {
        if (!global.dbAccess[0] || !global.dbAccess[1]) {
            resolve([]);
            return;
        }

        const conn = getConnection();
        if (!conn) {
            resolve([]);
            return;
        }

        const sql = `SELECT * FROM pizza_orders
                     WHERE OrderStatus NOT IN ('Delivered', 'Cancelled')
                     ORDER BY OrderDate ASC`;

        conn.query(sql, [], function(err, results) {
            if (err) {
                console.log('Error getting active orders: ' + err.message, false, true);
                resolve([]);
                return;
            }

            // Parse toppings JSON for all orders
            results.forEach(order => {
                try {
                    order.Toppings = JSON.parse(order.Toppings || '[]');
                } catch (e) {
                    order.Toppings = [];
                }
            });

            resolve(results);
        });
    });
}

/**
 * Updates order delivery time (marks as delivered)
 *
 * @param {string} orderID - Order ID
 * @param {Date} actualTime - Actual delivery time
 * @returns {Promise<boolean>} True if successful
 */
async function updateOrderDelivery(orderID, actualTime) {
    return new Promise((resolve, reject) => {
        if (!global.dbAccess[0] || !global.dbAccess[1]) {
            resolve(false);
            return;
        }

        const conn = getConnection();
        if (!conn) {
            resolve(false);
            return;
        }

        const sql = `UPDATE pizza_orders
                     SET ActualDelivery = ?, OrderStatus = 'Delivered'
                     WHERE OrderID = ?`;

        conn.query(sql, [actualTime, orderID], function(err, result) {
            if (err) {
                console.log('Error updating delivery time: ' + err.message, false, true);
                resolve(false);
                return;
            }

            resolve(true);
        });
    });
}

/**
 * Gets mock mode configuration value
 *
 * @returns {Promise<boolean>} True if mock mode enabled
 */
async function getMockModeConfig() {
    return new Promise((resolve, reject) => {
        if (!global.dbAccess[0] || !global.dbAccess[1]) {
            resolve(true); // Default to mock mode if DB unavailable
            return;
        }

        const conn = getConnection();
        if (!conn) {
            resolve(true);
            return;
        }

        const sql = `SELECT ConfigValue FROM pizza_config WHERE ConfigKey = 'mock_mode'`;

        conn.query(sql, [], function(err, results) {
            if (err || results.length === 0) {
                resolve(true); // Default to mock mode on error
                return;
            }

            resolve(results[0].ConfigValue === 'true');
        });
    });
}

/**
 * Cancels a pizza order
 *
 * @param {string} orderID - Order ID to cancel
 * @returns {Promise<boolean>} True if successful
 */
async function cancelOrder(orderID) {
    return new Promise((resolve, reject) => {
        if (!global.dbAccess[0] || !global.dbAccess[1]) {
            resolve(false);
            return;
        }

        const conn = getConnection();
        if (!conn) {
            resolve(false);
            return;
        }

        const sql = `UPDATE pizza_orders
                     SET OrderStatus = 'Cancelled'
                     WHERE OrderID = ? AND OrderStatus NOT IN ('Delivered', 'Cancelled')`;

        conn.query(sql, [orderID], function(err, result) {
            if (err) {
                console.log('Error cancelling order: ' + err.message, false, true);
                resolve(false);
                return;
            }

            resolve(result.affectedRows > 0);
        });
    });
}

/**
 * Cleanup function for graceful shutdown
 * Closes database connection
 */
function DBPizzaCleanup() {
    if (to != null) {
        clearTimeout(to);
        to = null;
    }

    if (connection != null) {
        connection.end();
        connection = null;
        console.log('Pizza DB cleanup complete', false, true);
    }
}

// Make cleanup function globally accessible
global.DBPizzaCleanup = DBPizzaCleanup;

module.exports = {
    createPizzaOrder,
    updateOrderStatus,
    getOrderByID,
    getUserOrders,
    getActiveOrders,
    updateOrderDelivery,
    getMockModeConfig,
    cancelOrder,
    DBPizzaCleanup
};
