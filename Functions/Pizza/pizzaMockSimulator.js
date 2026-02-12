/**
 * @fileoverview Mock Pizza Order Simulator for Baba Pizza Ordering Service
 *
 * Simulates order progression through various statuses in mock mode.
 * Follows the reminder system pattern with timeout management and status transitions.
 *
 * Order Status Progression:
 * Pending → (30-60s) → Preparing → (1-2min) → Baking →
 * (2-3min) → Quality Check → (1min) → Out for Delivery →
 * (5-10min) → Delivered
 *
 * @module pizzaMockSimulator
 */

const Discord = require('discord.js');
const { updateOrderStatus, updateOrderDelivery, getOrderByID } = require('../Database/databasePizzaController.js');
const { getD1 } = require('../../Tools/overrides.js');

/**
 * Order status progression map
 * Defines next status and delay range for each current status
 */
const STATUS_PROGRESSION = {
    'Pending': {
        next: 'Preparing',
        minDelay: 30000,    // 30 seconds
        maxDelay: 60000     // 1 minute
    },
    'Preparing': {
        next: 'Baking',
        minDelay: 60000,    // 1 minute
        maxDelay: 120000    // 2 minutes
    },
    'Baking': {
        next: 'Quality Check',
        minDelay: 120000,   // 2 minutes
        maxDelay: 180000    // 3 minutes
    },
    'Quality Check': {
        next: 'Out for Delivery',
        minDelay: 60000,    // 1 minute
        maxDelay: 90000     // 1.5 minutes
    },
    'Out for Delivery': {
        next: 'Delivered',
        minDelay: 300000,   // 5 minutes
        maxDelay: 600000    // 10 minutes
    },
    'Delivered': {
        next: null,
        minDelay: 0,
        maxDelay: 0
    }
};

/**
 * Funny Baba responses for each status
 */
const STATUS_RESPONSES = {
    'Pending': [
        'BABA SENDS YOUR ORDER TO THE KITCHEN! 📝',
        'THE PIZZA MAKERS SEE YOUR ORDER! 👀',
        'BABA NOTIFIES THE PIZZA TEAM! 🔔'
    ],
    'Preparing': [
        'BABA SEES THE PIZZA MAKERS WORKING! 👨‍🍳',
        'THE DOUGH IS BEING STRETCHED! 🤚',
        'PIZZA CONSTRUCTION HAS BEGUN! 🏗️',
        'TOPPINGS ARE BEING ADDED! 🍕'
    ],
    'Baking': [
        'BABA SMELLS THE PIZZA! 🔥',
        'THE OVEN IS WORKING HARD! ♨️',
        'PIZZA IS GETTING CRISPY! 🍕',
        'THE CHEESE IS MELTING! 🧀'
    ],
    'Quality Check': [
        'BABA INSPECTS THE PIZZA! 🔍',
        'THE PIZZA PASSES THE TEST! ✅',
        'BABA APPROVES OF THIS PIZZA! 👍',
        'QUALITY CONTROL IS HAPPY! ✨'
    ],
    'Out for Delivery': [
        'BABA SEES THE PIZZA MOBILE! 🚗',
        'THE PIZZA IS ON ITS WAY! 🛵',
        'DELIVERY HUMAN IS COMING! 🏃',
        'YOUR PIZZA IS TRAVELING! 🚙'
    ],
    'Delivered': [
        'PIZZA HAS ARRIVED! BABA IS HAPPY! 🎉',
        'THE PIZZA JOURNEY IS COMPLETE! 🏁',
        'ENJOY YOUR PIZZA! BABA IS PLEASED! 😋',
        'PIZZA DELIVERY SUCCESS! YUM! 🍕✨'
    ]
};

/**
 * Generates a mock Domino's order ID
 *
 * @returns {string} Mock order ID in format MOCK-timestamp-random
 */
function generateMockOrderID() {
    return `MOCK-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

/**
 * Calculate random delay for status transition
 *
 * @param {string} currentStatus - Current order status
 * @returns {number} Delay in milliseconds
 */
function calculateStatusDelay(currentStatus) {
    const progression = STATUS_PROGRESSION[currentStatus];
    if (!progression || progression.next === null) {
        return 0;
    }

    const min = progression.minDelay;
    const max = progression.maxDelay;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get random Baba response for status
 *
 * @param {string} status - Order status
 * @returns {string} Random Baba response
 */
function getRandomStatusResponse(status) {
    const responses = STATUS_RESPONSES[status] || ['BABA UPDATES YOUR ORDER! 📋'];
    return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * Progress order to next status
 *
 * @param {string} orderID - Order ID to progress
 * @returns {Promise<boolean>} True if progressed successfully
 */
async function progressOrderStatus(orderID) {
    const order = await getOrderByID(orderID);
    if (!order) {
        console.log('Cannot progress order - not found: ' + orderID, false, true);
        return false;
    }

    const progression = STATUS_PROGRESSION[order.OrderStatus];
    if (!progression || progression.next === null) {
        // Already delivered or cancelled
        return false;
    }

    const newStatus = progression.next;
    console.log(`Progressing order ${orderID}: ${order.OrderStatus} → ${newStatus}`, false, true);

    // Update database
    await updateOrderStatus(orderID, newStatus);

    // If delivered, set actual delivery time
    if (newStatus === 'Delivered') {
        await updateOrderDelivery(orderID, getD1(true));
    }

    // Send status update DM to user
    await sendStatusUpdateDM(order.UserID, orderID, newStatus);

    return true;
}

/**
 * Send status update DM to user with tracking embed
 *
 * @param {string} userID - Discord user ID
 * @param {string} orderID - Order ID
 * @param {string} newStatus - New status
 */
async function sendStatusUpdateDM(userID, orderID, newStatus) {
    try {
        const user = await global.Bot.users.fetch(userID);
        if (!user) {
            console.log('Cannot send DM - user not found: ' + userID, false, true);
            return;
        }

        const order = await getOrderByID(orderID);
        if (!order) return;

        const response = getRandomStatusResponse(newStatus);
        const progressBar = getProgressBar(newStatus);
        const statusEmoji = getStatusEmoji(newStatus);

        const embed = new Discord.EmbedBuilder()
            .setColor('#FF6B35')
            .setTitle('🍕 BABA PIZZA ORDER UPDATE')
            .setDescription(response)
            .addFields(
                { name: 'Order ID', value: `\`${orderID.substring(0, 20)}...\``, inline: false },
                { name: 'Status', value: `${statusEmoji} **${newStatus}**`, inline: false },
                { name: 'Progress', value: progressBar, inline: false }
            )
            .setFooter({
                text: 'Pizza by Baba!',
                iconURL: 'https://media.discordapp.net/attachments/574840583563116566/949515044746559568/JSO3bX0V.png'
            })
            .setTimestamp();

        await user.send({ embeds: [embed] });
        console.log(`Sent DM to ${userID} for order ${orderID} (${newStatus})`, false, true);
    } catch (err) {
        console.log('Error sending status DM: ' + err.message, false, true);
    }
}

/**
 * Get progress bar for order status
 *
 * @param {string} status - Current order status
 * @returns {string} Progress bar string
 */
function getProgressBar(status) {
    const stages = ['Pending', 'Preparing', 'Baking', 'Quality Check', 'Out for Delivery', 'Delivered'];
    const currentIndex = stages.indexOf(status);
    const progress = currentIndex === -1 ? 0 : Math.floor((currentIndex + 1) / stages.length * 10);

    const filled = '█'.repeat(progress);
    const empty = '░'.repeat(10 - progress);

    return `[${filled}${empty}] ${(progress * 10)}%`;
}

/**
 * Get emoji for order status
 *
 * @param {string} status - Order status
 * @returns {string} Status emoji
 */
function getStatusEmoji(status) {
    const emojis = {
        'Pending': '⏳',
        'Preparing': '👨‍🍳',
        'Baking': '🔥',
        'Quality Check': '✅',
        'Out for Delivery': '🚗',
        'Delivered': '🎉',
        'Cancelled': '❌'
    };
    return emojis[status] || '📋';
}

/**
 * Start mock order simulation with automatic status progression
 *
 * @param {string} orderID - Order ID to simulate
 */
async function startMockOrderSimulation(orderID) {
    const order = await getOrderByID(orderID);
    if (!order) {
        console.log('Cannot start simulation - order not found: ' + orderID, false, true);
        return;
    }

    // Don't simulate if already delivered or cancelled
    if (order.OrderStatus === 'Delivered' || order.OrderStatus === 'Cancelled') {
        return;
    }

    const delay = calculateStatusDelay(order.OrderStatus);
    if (delay === 0) {
        return; // No more progression
    }

    console.log(`Scheduling status update for ${orderID} in ${delay}ms`, false, true);

    const timeout = setTimeout(async () => {
        const progressed = await progressOrderStatus(orderID);
        if (progressed) {
            // Continue simulation for next status
            await startMockOrderSimulation(orderID);
        }
    }, delay);

    // Store timeout in global state
    if (!global.pizzaTimeouts) {
        global.pizzaTimeouts = {};
    }
    global.pizzaTimeouts[orderID] = timeout;
}

/**
 * Stop mock order simulation (clear timeout)
 *
 * @param {string} orderID - Order ID to stop
 */
function stopMockOrderSimulation(orderID) {
    if (global.pizzaTimeouts && global.pizzaTimeouts[orderID]) {
        clearTimeout(global.pizzaTimeouts[orderID]);
        delete global.pizzaTimeouts[orderID];
        console.log('Stopped simulation for order: ' + orderID, false, true);
    }
}

/**
 * Cleanup all mock order simulations
 * Called on bot shutdown
 */
function cleanupAllSimulations() {
    if (global.pizzaTimeouts) {
        Object.keys(global.pizzaTimeouts).forEach(orderID => {
            stopMockOrderSimulation(orderID);
        });
    }
}

module.exports = {
    generateMockOrderID,
    startMockOrderSimulation,
    stopMockOrderSimulation,
    cleanupAllSimulations,
    getProgressBar,
    getStatusEmoji,
    getRandomStatusResponse
};
