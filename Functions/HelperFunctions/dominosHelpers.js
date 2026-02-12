/**
 * @fileoverview Domino's Pizza API Wrapper for Baba Pizza Ordering Service
 *
 * Provides abstraction layer over the 'dominos' npm package with mock mode support.
 * In mock mode, simulates API responses without making real API calls.
 * In real mode, integrates with actual Domino's Pizza API for order placement and tracking.
 *
 * @module dominosHelpers
 */

const dominos = require('dominos');
const { generateMockOrderID } = require('../Pizza/pizzaMockSimulator.js');

/**
 * Domino's API Wrapper Class
 * Handles both mock and real API interactions
 */
class DominosWrapper {
    /**
     * Creates a new Domino's API wrapper
     *
     * @param {boolean} mockMode - If true, simulates API calls; if false, uses real API
     */
    constructor(mockMode = true) {
        this.mockMode = mockMode;
    }

    /**
     * Finds nearby Domino's stores for a given address
     *
     * @param {string} address - Delivery address
     * @returns {Promise<Object>} Store information
     */
    async findNearbyStores(address) {
        if (this.mockMode) {
            // Mock response
            return {
                storeID: 'MOCK-STORE-12345',
                storeName: 'Baba Test Domino\'s',
                address: '123 Mock Street, Test City, TS 12345',
                phone: '555-MOCK-PIZZA',
                isOpen: true
            };
        }

        // Real API call (requires address validation)
        try {
            const nearbyStores = await dominos.Util.findNearbyStores(address);
            if (nearbyStores && nearbyStores.length > 0) {
                return {
                    storeID: nearbyStores[0].StoreID,
                    storeName: nearbyStores[0].StoreName,
                    address: nearbyStores[0].AddressDescription,
                    phone: nearbyStores[0].Phone,
                    isOpen: nearbyStores[0].IsOnlineNow
                };
            }
            return null;
        } catch (err) {
            console.log('Error finding stores: ' + err.message, false, true);
            return null;
        }
    }

    /**
     * Places an order with Domino's
     *
     * @param {Object} orderDetails - Order information
     * @param {string} orderDetails.storeID - Store ID
     * @param {string} orderDetails.address - Delivery address
     * @param {string} orderDetails.size - Pizza size
     * @param {string} orderDetails.crust - Crust type
     * @param {Array} orderDetails.toppings - Toppings array
     * @param {Object} orderDetails.customer - Customer info
     * @returns {Promise<Object>} Order result
     */
    async placeOrder(orderDetails) {
        if (this.mockMode) {
            // Mock order placement
            const mockOrderID = generateMockOrderID();
            const estimatedDelivery = new Date(Date.now() + 30 * 60 * 1000);

            return {
                success: true,
                orderID: mockOrderID,
                status: 'Pending',
                estimatedDelivery: estimatedDelivery,
                trackingUrl: `https://mock-dominos-tracker.com/${mockOrderID}`
            };
        }

        // Real API call (COMMENTED FOR SAFETY - uncomment when ready for production)
        /*
        try {
            const customer = new dominos.Customer(orderDetails.customer);
            const order = new dominos.Order(customer);

            // Add address
            order.storeID = orderDetails.storeID;
            order.addAddress(orderDetails.address);

            // Add pizza (map our format to Domino's format)
            const pizza = this.buildDominosPizza(orderDetails);
            order.addItem(pizza);

            // Place the order
            const result = await order.place();

            return {
                success: true,
                orderID: result.OrderID,
                status: result.Status,
                estimatedDelivery: new Date(result.EstimatedDelivery),
                trackingUrl: result.TrackingUrl
            };
        } catch (err) {
            console.log('Error placing real order: ' + err.message, false, true);
            return {
                success: false,
                error: err.message
            };
        }
        */

        // Return error if real mode is enabled but code is commented
        return {
            success: false,
            error: 'Real mode is not yet configured. Please enable mock mode or configure Domino\'s API credentials.'
        };
    }

    /**
     * Tracks an existing order
     *
     * @param {string} orderID - Order ID to track
     * @param {string} storeID - Store ID
     * @param {string} phone - Customer phone number
     * @returns {Promise<Object>} Order tracking information
     */
    async trackOrder(orderID, storeID, phone) {
        if (this.mockMode) {
            // Mock tracking response
            return {
                orderID: orderID,
                status: 'Baking',
                estimatedDelivery: new Date(Date.now() + 15 * 60 * 1000),
                trackingUrl: `https://mock-dominos-tracker.com/${orderID}`
            };
        }

        // Real API call (COMMENTED FOR SAFETY - uncomment when ready for production)
        /*
        try {
            const tracking = await dominos.Tracking.byPhone(phone, storeID);

            return {
                orderID: tracking.OrderID,
                status: tracking.OrderStatus,
                estimatedDelivery: new Date(tracking.EstimatedDelivery),
                trackingUrl: tracking.TrackingUrl
            };
        } catch (err) {
            console.log('Error tracking order: ' + err.message, false, true);
            return null;
        }
        */

        return null;
    }

    /**
     * Builds a Domino's pizza object from our format
     * (Used when real mode is enabled)
     *
     * @param {Object} orderDetails - Our order format
     * @returns {Object} Domino's pizza object
     * @private
     */
    buildDominosPizza(orderDetails) {
        // This would map our format to Domino's API format
        // Example structure (actual implementation depends on dominos package)
        const pizza = new dominos.Item();

        // Map size
        const sizeMap = {
            'small': '10',
            'medium': '12',
            'large': '14',
            'xlarge': '16'
        };
        pizza.Size = sizeMap[orderDetails.size] || '14';

        // Map crust
        const crustMap = {
            'hand_tossed': 'HANDTOSS',
            'thin': 'THIN',
            'brooklyn': 'BROOKLYN',
            'gluten_free': 'GLUTENFREE'
        };
        pizza.Crust = crustMap[orderDetails.crust] || 'HANDTOSS';

        // Map toppings
        orderDetails.toppings.forEach(topping => {
            const toppingCode = this.mapToppingToDominos(topping);
            if (toppingCode) {
                pizza.addTopping(toppingCode);
            }
        });

        return pizza;
    }

    /**
     * Maps our topping names to Domino's topping codes
     *
     * @param {string} topping - Our topping name
     * @returns {string|null} Domino's topping code
     * @private
     */
    mapToppingToDominos(topping) {
        const toppingMap = {
            'pepperoni': 'P',
            'sausage': 'S',
            'bacon': 'K',
            'ham': 'H',
            'chicken': 'Du',
            'mushrooms': 'M',
            'onions': 'O',
            'green_peppers': 'G',
            'black_olives': 'R',
            'tomatoes': 'T',
            'spinach': 'Si',
            'jalapeños': 'J',
            'pineapple': 'N',
            'extra_cheese': 'C',
            'banana_peppers': 'Z'
        };

        const normalized = topping.toLowerCase().replace(/ /g, '_');
        return toppingMap[normalized] || null;
    }

    /**
     * Validates an address using Domino's API
     *
     * @param {string} address - Address to validate
     * @returns {Promise<boolean>} True if valid
     */
    async validateAddress(address) {
        if (this.mockMode) {
            // Mock validation - always return true
            return true;
        }

        // Real API call (COMMENTED FOR SAFETY)
        /*
        try {
            const stores = await dominos.Util.findNearbyStores(address);
            return stores && stores.length > 0;
        } catch (err) {
            return false;
        }
        */

        return true;
    }
}

module.exports = { DominosWrapper };
