/**
 * @fileoverview Pizza Menu Data for Baba Pizza Ordering Service
 *
 * Contains menu items, prices, and validation rules for pizza customization.
 * Used by pizzaFunctions.js for order building and price calculation.
 *
 * @module pizzaMenuData
 */

module.exports = {
    /**
     * Available pizza sizes with prices
     */
    sizes: [
        { id: 'small', name: 'Small (10")', price: 8.99 },
        { id: 'medium', name: 'Medium (12")', price: 11.99 },
        { id: 'large', name: 'Large (14")', price: 14.99 },
        { id: 'xlarge', name: 'X-Large (16")', price: 17.99 }
    ],

    /**
     * Available crust types with additional prices
     */
    crusts: [
        { id: 'hand_tossed', name: 'Hand Tossed', price: 0 },
        { id: 'thin', name: 'Thin Crust', price: 0 },
        { id: 'brooklyn', name: 'Brooklyn Style', price: 1.50 },
        { id: 'gluten_free', name: 'Gluten Free', price: 2.00 }
    ],

    /**
     * Available toppings (each costs toppingPrice)
     */
    toppings: [
        'Pepperoni',
        'Sausage',
        'Bacon',
        'Ham',
        'Chicken',
        'Mushrooms',
        'Onions',
        'Green Peppers',
        'Black Olives',
        'Tomatoes',
        'Spinach',
        'Jalapeños',
        'Pineapple',
        'Extra Cheese',
        'Banana Peppers'
    ],

    /**
     * Maximum number of toppings allowed per pizza
     */
    maxToppings: 10,

    /**
     * Price per topping
     */
    toppingPrice: 1.25,

    /**
     * Get size object by ID
     * @param {string} sizeId - Size ID
     * @returns {Object|null} Size object or null if not found
     */
    getSizeById(sizeId) {
        return this.sizes.find(s => s.id === sizeId) || null;
    },

    /**
     * Get crust object by ID
     * @param {string} crustId - Crust ID
     * @returns {Object|null} Crust object or null if not found
     */
    getCrustById(crustId) {
        return this.crusts.find(c => c.id === crustId) || null;
    },

    /**
     * Validate topping name
     * @param {string} topping - Topping name
     * @returns {boolean} True if valid topping
     */
    isValidTopping(topping) {
        const normalizedTopping = topping.toLowerCase().replace(/_/g, ' ');
        return this.toppings.some(t => t.toLowerCase() === normalizedTopping);
    },

    /**
     * Normalize topping name from ID to display name
     * @param {string} toppingId - Topping ID (e.g., "green_peppers")
     * @returns {string} Display name (e.g., "Green Peppers")
     */
    normalizeToppingName(toppingId) {
        const normalizedId = toppingId.toLowerCase().replace(/_/g, ' ');
        return this.toppings.find(t => t.toLowerCase() === normalizedId) || toppingId;
    }
};
