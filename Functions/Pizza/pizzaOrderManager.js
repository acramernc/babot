/**
 * @fileoverview Pizza Order Manager for Baba Pizza Ordering Service
 *
 * Manages pizza order state with JSON cache + MySQL database sync pattern.
 * Follows the reminder system architecture with UpdateDB flags for syncing.
 *
 * State Management:
 * - JSON cache (pizzaOrders.json) for fast access and persistence across restarts
 * - MySQL database for long-term storage and querying
 * - UpdateDB flags: "Add", "Edit", "Delete" to track what needs syncing
 *
 * @module pizzaOrderManager
 */

var babadata = require('../../babotdata.json');
const fs = require('fs');
const { getActiveOrders } = require('../Database/databasePizzaController.js');
const { startMockOrderSimulation, stopMockOrderSimulation, cleanupAllSimulations } = require('./pizzaMockSimulator.js');

/**
 * Gets pizza orders from JSON cache
 * Creates file if it doesn't exist
 *
 * @returns {Array} Array of order objects
 */
function getPizzaOrdersJSON() {
    const filepath = babadata.datalocation + "pizzaOrders.json";

    if (!fs.existsSync(filepath)) {
        fs.writeFileSync(filepath, JSON.stringify([]));
        return [];
    }

    try {
        const data = fs.readFileSync(filepath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.log('Error reading pizzaOrders.json: ' + err.message, false, true);
        return [];
    }
}

/**
 * Saves pizza orders to JSON cache
 *
 * @param {Array} orders - Array of order objects
 */
function savePizzaOrdersJSON(orders) {
    const filepath = babadata.datalocation + "pizzaOrders.json";

    try {
        fs.writeFileSync(filepath, JSON.stringify(orders, null, 2));
    } catch (err) {
        console.log('Error writing pizzaOrders.json: ' + err.message, false, true);
    }
}

/**
 * Add order to JSON cache with UpdateDB flag
 *
 * @param {Object} orderData - Order object
 */
function addOrderToCache(orderData) {
    const orders = getPizzaOrdersJSON();

    orderData.UpdateDB = "Add";

    orders.push(orderData);
    savePizzaOrdersJSON(orders);
}

/**
 * Update order in JSON cache
 *
 * @param {string} orderID - Order ID to update
 * @param {Object} updates - Fields to update
 */
function updateOrderInCache(orderID, updates) {
    const orders = getPizzaOrdersJSON();
    const orderIndex = orders.findIndex(o => o.OrderID === orderID);

    if (orderIndex !== -1) {
        orders[orderIndex] = {
            ...orders[orderIndex],
            ...updates,
            UpdateDB: "Edit"
        };
        savePizzaOrdersJSON(orders);
    }
}

/**
 * Remove order from JSON cache
 *
 * @param {string} orderID - Order ID to remove
 */
function removeOrderFromCache(orderID) {
    let orders = getPizzaOrdersJSON();
    orders = orders.filter(o => o.OrderID !== orderID);
    savePizzaOrdersJSON(orders);
}

/**
 * Refresh pizza orders - resumes simulations for active orders
 * Called on bot startup and periodically
 */
async function RefreshPizzaOrders() {
    console.log('Refreshing pizza orders...', false, true);

    // Get active orders from database
    const activeOrders = await getActiveOrders();

    if (activeOrders.length === 0) {
        console.log('No active pizza orders to refresh', false, true);
        return;
    }

    console.log(`Found ${activeOrders.length} active pizza orders`, false, true);

    // Resume simulations for each active order
    for (const order of activeOrders) {
        // Only simulate mock orders
        if (order.IsMockOrder) {
            await startMockOrderSimulation(order.OrderID);
        }
    }

    console.log('Pizza order refresh complete', false, true);
}

/**
 * Cleanup pizza orders on bot shutdown
 * Stops all simulations and saves state
 */
function CleanupPizzaOrders() {
    console.log('Cleaning up pizza orders...', false, true);

    // Stop all mock simulations
    cleanupAllSimulations();

    // Clear global state
    if (global.pizzaOrders) {
        global.pizzaOrders = {};
    }

    console.log('Pizza order cleanup complete', false, true);
}

/**
 * Sync UpdateDB flags to database
 * Processes any pending Add/Edit/Delete operations
 *
 * @returns {Promise<void>}
 */
async function syncOrdersToDB() {
    const { createPizzaOrder, updateOrderStatus, cancelOrder } = require('../Database/databasePizzaController.js');

    const orders = getPizzaOrdersJSON();
    const updatePromises = [];

    for (const order of orders) {
        if (order.UpdateDB === "Add") {
            updatePromises.push(createPizzaOrder(order));
            order.UpdateDB = null;
        } else if (order.UpdateDB === "Edit") {
            updatePromises.push(updateOrderStatus(order.OrderID, order.OrderStatus));
            order.UpdateDB = null;
        } else if (order.UpdateDB === "Delete") {
            updatePromises.push(cancelOrder(order.OrderID));
            // Remove from cache after deletion
            removeOrderFromCache(order.OrderID);
        }
    }

    if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
        savePizzaOrdersJSON(orders.filter(o => o.UpdateDB !== "Delete"));
        console.log(`Synced ${updatePromises.length} pizza orders to database`, false, true);
    }
}

// Make cleanup function globally accessible
global.CleanupPizzaOrders = CleanupPizzaOrders;
global.RefreshPizzaOrders = RefreshPizzaOrders;

module.exports = {
    getPizzaOrdersJSON,
    savePizzaOrdersJSON,
    addOrderToCache,
    updateOrderInCache,
    removeOrderFromCache,
    RefreshPizzaOrders,
    CleanupPizzaOrders,
    syncOrdersToDB
};
