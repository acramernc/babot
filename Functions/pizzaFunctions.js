/**
 * @fileoverview Core Pizza Functions for Baba Pizza Ordering Service
 *
 * Contains main pizza ordering logic including:
 * - Main menu display with buttons
 * - Order placement and tracking
 * - Order history and cancellation
 * - Price calculation and validation
 * - Embed generation for tracking/history
 * - Funny Baba responses
 *
 * These functions are called by slash command handlers and button interactions.
 *
 * @module pizzaFunctions
 */

var babadata = require('../babotdata.json');
const Discord = require('discord.js');
const { createPizzaOrder, getUserOrders, getOrderByID, cancelOrder } = require('./Database/databasePizzaController.js');
const { generateMockOrderID, startMockOrderSimulation, stopMockOrderSimulation, getProgressBar, getStatusEmoji, getRandomStatusResponse } = require('./Pizza/pizzaMockSimulator.js');
const menuData = require('./Pizza/pizzaMenuData.js');
const fs = require('fs');

/**
 * Generates main pizza menu with action buttons
 *
 * @returns {Object} Discord message object with content and button components
 */
function babaPizzaMenu() {
    const row = new Discord.ActionRowBuilder()
        .addComponents(
            new Discord.ButtonBuilder()
                .setCustomId('pizza_order_new')
                .setLabel('New Order')
                .setStyle(3)
                .setEmoji('🍕'),
            new Discord.ButtonBuilder()
                .setCustomId('pizza_track')
                .setLabel('Track Order')
                .setStyle(1)
                .setEmoji('📍'),
            new Discord.ButtonBuilder()
                .setCustomId('pizza_history')
                .setLabel('Order History')
                .setStyle(2)
                .setEmoji('📜')
        );

    return {
        content: '🍕 **BABA PIZZA ORDERING SERVICE™**\n\nSelect an option below:',
        components: [row]
    };
}

/**
 * Places a pizza order (creates in database and starts simulation)
 *
 * @param {Object} orderData - Order information
 * @param {string} orderData.userID - Discord user ID
 * @param {string} orderData.guildID - Discord guild ID
 * @param {string} orderData.size - Pizza size
 * @param {string} orderData.crust - Crust type
 * @param {Array} orderData.toppings - Array of topping names
 * @param {string} orderData.address - Delivery address
 * @param {string} orderData.instructions - Special instructions
 * @returns {Promise<Object>} Discord message object with order confirmation
 */
async function babaPizzaOrder(orderData) {
    const orderID = generateMockOrderID();
    const price = calculateOrderPrice(orderData.size, orderData.crust, orderData.toppings || []);

    // Calculate estimated delivery (30 minutes from now)
    const estimatedDelivery = new Date(Date.now() + 30 * 60 * 1000);

    // Create order in database
    const created = await createPizzaOrder({
        OrderID: orderID,
        UserID: orderData.userID,
        GuildID: orderData.guildID,
        Size: orderData.size,
        Crust: orderData.crust,
        Toppings: orderData.toppings || [],
        SpecialInstructions: orderData.instructions || null,
        Address: orderData.address || 'Mock address (test mode)',
        OrderStatus: 'Pending',
        EstimatedDelivery: estimatedDelivery,
        Price: price,
        DominosOrderID: null,
        IsMockOrder: true
    });

    if (!created) {
        return {
            content: 'BABA FAILED TO ORDER PIZZA! Database might be sleeping! 😴 Try again later!'
        };
    }

    // Start mock order simulation
    await startMockOrderSimulation(orderID);

    // Generate embed
    const embed = createOrderConfirmationEmbed(orderData, orderID, price, estimatedDelivery);

    // Get random pizza image
    const pizzaImage = babaPizzaImage();

    return {
        content: getRandomPizzaResponse('order_placed'),
        embeds: [embed],
        files: pizzaImage ? [pizzaImage] : []
    };
}

/**
 * Tracks a pizza order by ID or gets user's most recent order
 *
 * @param {string} orderID - Order ID to track (optional, uses most recent if not provided)
 * @param {string} userID - User ID (used if orderID not provided)
 * @returns {Promise<Object>} Discord message object with tracking embed
 */
async function babaPizzaTrack(orderID, userID) {
    let order = null;

    if (orderID) {
        order = await getOrderByID(orderID);
    } else if (userID) {
        const orders = await getUserOrders(userID, 1);
        if (orders.length > 0) {
            order = orders[0];
        }
    }

    if (!order) {
        return {
            content: 'BABA CANNOT FIND ORDER! Maybe it was eaten already? 🤷'
        };
    }

    const embed = createOrderTrackingEmbed(order);

    return {
        embeds: [embed]
    };
}

/**
 * Gets user's order history with pagination
 *
 * @param {string} userID - Discord user ID
 * @param {number} page - Page number (0-indexed)
 * @returns {Promise<Object>} Discord message object with history embed
 */
async function babaPizzaHistory(userID, page = 0) {
    const orders = await getUserOrders(userID, 50);

    if (orders.length === 0) {
        return {
            content: 'BABA FINDS NO PIZZA HISTORY! You have not ordered any pizzas yet! 🍕'
        };
    }

    const itemsPerPage = 5;
    const totalPages = Math.ceil(orders.length / itemsPerPage);
    const startIndex = page * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, orders.length);
    const pageOrders = orders.slice(startIndex, endIndex);

    const embed = createOrderHistoryEmbed(pageOrders, page, totalPages, userID);

    const components = [];
    if (totalPages > 1) {
        const row = new Discord.ActionRowBuilder();
        const prevButton = new Discord.ButtonBuilder()
            .setCustomId(`pizza_history_page_${page - 1}`)
            .setLabel('Previous')
            .setStyle(1)
            .setDisabled(page === 0);

        const nextButton = new Discord.ButtonBuilder()
            .setCustomId(`pizza_history_page_${page + 1}`)
            .setLabel('Next')
            .setStyle(1)
            .setDisabled(page >= totalPages - 1);

        row.addComponents(prevButton, nextButton);
        components.push(row);
    }

    return {
        embeds: [embed],
        components: components
    };
}

/**
 * Cancels a pizza order
 *
 * @param {string} orderID - Order ID to cancel
 * @returns {Promise<Object>} Discord message object with cancellation confirmation
 */
async function babaPizzaCancel(orderID) {
    const cancelled = await cancelOrder(orderID);

    if (!cancelled) {
        return {
            content: 'BABA CANNOT CANCEL ORDER! It might already be delivered or cancelled! 🤔'
        };
    }

    // Stop mock simulation
    stopMockOrderSimulation(orderID);

    return {
        content: 'BABA CANCELLED THE PIZZA! 🚫 Order has been stopped!'
    };
}

/**
 * Calculates total pizza order price
 *
 * @param {string} sizeId - Size ID (small/medium/large/xlarge)
 * @param {string} crustId - Crust ID
 * @param {Array} toppings - Array of topping IDs
 * @returns {number} Total price
 */
function calculateOrderPrice(sizeId, crustId, toppings) {
    const size = menuData.getSizeById(sizeId);
    const crust = menuData.getCrustById(crustId);

    if (!size || !crust) {
        return 0;
    }

    const basePrice = size.price;
    const crustPrice = crust.price;
    const toppingPrice = menuData.toppingPrice * (toppings ? toppings.length : 0);

    return basePrice + crustPrice + toppingPrice;
}

/**
 * Gets random Baba pizza response
 *
 * @param {string} category - Response category (order_placed, etc.)
 * @returns {string} Random Baba response
 */
function getRandomPizzaResponse(category) {
    const responses = {
        order_placed: [
            'BABA ORDERS PIZZA FOR YOU! 🍕',
            'PIZZA IS COMING! BABA IS EXCITED! 🎉',
            'BABA SUMMONS THE PIZZA GODS! ⚡🍕',
            'BABA MAKES THE PIZZA HAPPEN! 🎊',
            'PIZZA TIME! BABA IS PROUD! 😊',
            'BABA TELLS THE OVEN TO HEAT UP! 🔥'
        ]
    };

    const list = responses[category] || ['BABA DOES PIZZA THINGS! 🍕'];
    return list[Math.floor(Math.random() * list.length)];
}

/**
 * Gets random pizza image from PizzaImages folder
 *
 * @returns {Discord.AttachmentBuilder|null} Pizza image attachment or null if folder empty
 */
function babaPizzaImage() {
    try {
        const imageDir = babadata.datalocation + 'PizzaImages/';

        if (!fs.existsSync(imageDir)) {
            return null;
        }

        const files = fs.readdirSync(imageDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));

        if (files.length === 0) {
            return null;
        }

        const randomFile = files[Math.floor(Math.random() * files.length)];
        const imagePath = imageDir + randomFile;

        return new Discord.AttachmentBuilder(imagePath, {
            name: 'pizza.jpg',
            description: 'BABA PIZZA! LOOKS DELICIOUS!'
        });
    } catch (err) {
        console.log('Error loading pizza image: ' + err.message, false, true);
        return null;
    }
}

/**
 * Creates order confirmation embed
 *
 * @param {Object} orderData - Order data
 * @param {string} orderID - Order ID
 * @param {number} price - Total price
 * @param {Date} estimatedDelivery - Estimated delivery time
 * @returns {Discord.EmbedBuilder} Order confirmation embed
 */
function createOrderConfirmationEmbed(orderData, orderID, price, estimatedDelivery) {
    const size = menuData.getSizeById(orderData.size);
    const crust = menuData.getCrustById(orderData.crust);

    const toppingNames = (orderData.toppings || []).map(t => menuData.normalizeToppingName(t));
    const toppingsList = toppingNames.length > 0 ? toppingNames.join(', ') : 'None';

    return new Discord.EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle('✅ PIZZA ORDER CONFIRMED')
        .setDescription('Your order has been placed successfully!')
        .addFields(
            { name: 'Order ID', value: `\`${orderID}\``, inline: false },
            { name: 'Size', value: size.name, inline: true },
            { name: 'Crust', value: crust.name, inline: true },
            { name: 'Price', value: `$${price.toFixed(2)}`, inline: true },
            { name: 'Toppings', value: toppingsList, inline: false },
            { name: 'Estimated Delivery', value: `<t:${Math.floor(estimatedDelivery.getTime() / 1000)}:R>`, inline: false }
        )
        .setFooter({
            text: 'Pizza by Baba! You will receive status updates via DM.',
            iconURL: 'https://media.discordapp.net/attachments/574840583563116566/949515044746559568/JSO3bX0V.png'
        })
        .setTimestamp();
}

/**
 * Creates order tracking embed
 *
 * @param {Object} order - Order object from database
 * @returns {Discord.EmbedBuilder} Tracking embed
 */
function createOrderTrackingEmbed(order) {
    const progressBar = getProgressBar(order.OrderStatus);
    const statusEmoji = getStatusEmoji(order.OrderStatus);

    const size = menuData.getSizeById(order.Size);
    const crust = menuData.getCrustById(order.Crust);

    const toppingNames = order.Toppings.map(t => menuData.normalizeToppingName(t));
    const toppingsList = toppingNames.length > 0 ? toppingNames.join(', ') : 'None';

    const embed = new Discord.EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle('🍕 BABA PIZZA TRACKING SYSTEM')
        .setDescription(`Order #${order.OrderID.substring(0, 20)}...`)
        .addFields(
            { name: 'Status', value: `${statusEmoji} **${order.OrderStatus}**`, inline: false },
            { name: 'Progress', value: progressBar, inline: false },
            { name: 'Size', value: size.name, inline: true },
            { name: 'Crust', value: crust.name, inline: true },
            { name: 'Price', value: `$${order.Price.toFixed(2)}`, inline: true },
            { name: 'Toppings', value: toppingsList, inline: false }
        )
        .setFooter({
            text: 'Pizza by Baba!',
            iconURL: 'https://media.discordapp.net/attachments/574840583563116566/949515044746559568/JSO3bX0V.png'
        })
        .setTimestamp(new Date(order.OrderDate));

    if (order.EstimatedDelivery && order.OrderStatus !== 'Delivered') {
        embed.addFields({
            name: 'Estimated Delivery',
            value: `<t:${Math.floor(new Date(order.EstimatedDelivery).getTime() / 1000)}:R>`,
            inline: false
        });
    }

    if (order.ActualDelivery) {
        embed.addFields({
            name: 'Delivered At',
            value: `<t:${Math.floor(new Date(order.ActualDelivery).getTime() / 1000)}:F>`,
            inline: false
        });
    }

    return embed;
}

/**
 * Creates order history embed
 *
 * @param {Array} orders - Array of order objects
 * @param {number} page - Current page number
 * @param {number} totalPages - Total number of pages
 * @param {string} userID - User ID
 * @returns {Discord.EmbedBuilder} History embed
 */
function createOrderHistoryEmbed(orders, page, totalPages, userID) {
    const embed = new Discord.EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle('📜 BABA PIZZA ORDER HISTORY')
        .setDescription(`Your pizza order history (Page ${page + 1} of ${totalPages})`);

    orders.forEach((order, index) => {
        const statusIcon = getStatusEmoji(order.OrderStatus);
        const timeAgo = `<t:${Math.floor(new Date(order.OrderDate).getTime() / 1000)}:R>`;

        const size = menuData.getSizeById(order.Size);
        const toppingNames = order.Toppings.slice(0, 2).map(t => menuData.normalizeToppingName(t));
        const toppingsPreview = toppingNames.length > 0 ? ` with ${toppingNames.join(', ')}` : '';
        const moreToppings = order.Toppings.length > 2 ? ` + ${order.Toppings.length - 2} more` : '';

        embed.addFields({
            name: `${index + 1 + (page * 5)}. Order #${order.OrderID.substring(0, 16)}...`,
            value: `${size.name}${toppingsPreview}${moreToppings}\n${order.OrderStatus} ${statusIcon} • $${order.Price.toFixed(2)} • ${timeAgo}`,
            inline: false
        });
    });

    embed.setFooter({
        text: 'Pizza by Baba!',
        iconURL: 'https://media.discordapp.net/attachments/574840583563116566/949515044746559568/JSO3bX0V.png'
    });

    return embed;
}

module.exports = {
    babaPizzaMenu,
    babaPizzaOrder,
    babaPizzaTrack,
    babaPizzaHistory,
    babaPizzaCancel,
    calculateOrderPrice
};
