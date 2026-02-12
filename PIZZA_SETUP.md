# Baba Pizza Ordering Service - Setup Guide

## Implementation Complete! ✅

The Baba Pizza Ordering Service has been fully implemented with all core features:
- ✅ Interactive order builder with size, crust, and topping selection
- ✅ Mock order simulation with automatic status progression
- ✅ Order tracking with real-time DM updates
- ✅ Order history with pagination
- ✅ Database storage for order persistence
- ✅ Domino's API wrapper (ready for real mode when credentials are available)

## Next Steps to Get Started

### 1. Create the Database Tables

Run the SQL schema file against your MySQL database:

```bash
# Connect to your MySQL database
mysql -u [username] -p [database_name] < pizza_schema.sql
```

Or manually execute the SQL from [pizza_schema.sql](pizza_schema.sql) in your database client.

This will create:
- `pizza_orders` table - Stores all pizza orders
- `pizza_config` table - Stores configuration (mock mode, API keys, etc.)

### 2. Add Pizza Images (Optional but Recommended)

Add 8-10 funny pizza images to make orders more fun:

1. Find or create pizza images (JPG or PNG)
2. Name them: `0.jpg`, `1.jpg`, `2.jpg`, etc.
3. Place them in: `Data/PizzaImages/`

The bot will randomly select one when orders are placed!

### 3. Deploy the Updated Commands

Since the `/pizza` command has been modified, you need to re-deploy slash commands:

```bash
node deployCommands.js
```

You should see "Successfully registered application commands."

### 4. Restart the Bot

```bash
# If running with forever
forever restart babot.js

# Or if running manually
node babot.js
```

## Testing the Pizza Ordering Flow

### 1. Place an Order

In Discord, run:
```
/pizza
```

You'll see the main menu with three buttons:
- 🍕 **New Order** - Start building your pizza
- 📍 **Track Order** - Track your most recent order
- 📜 **Order History** - View all your past orders

Click **New Order** and:
1. Select a pizza size (Small/Medium/Large/X-Large)
2. Select a crust type (Hand Tossed/Thin/Brooklyn/Gluten Free)
3. Select toppings (0-10 toppings)
4. Click **Place Order**
5. Fill in the modal with address and special instructions (both optional in mock mode)
6. Submit!

### 2. Watch the Magic Happen

After placing an order, you'll:
- See an order confirmation embed with your order details
- Receive a random pizza image
- Get DM notifications as your order progresses through statuses:
  - Pending → Preparing (30-60s)
  - Preparing → Baking (1-2min)
  - Baking → Quality Check (2-3min)
  - Quality Check → Out for Delivery (1min)
  - Out for Delivery → Delivered (5-10min)

### 3. Track Your Order

Run `/pizza` again and click **Track Order** to see:
- Current status with emoji
- Progress bar
- Estimated delivery time
- Full order details

### 4. View Order History

Click **Order History** to see all your past orders with pagination.

## Features in Detail

### Mock Mode (Current Setup)
- ✅ No real API credentials needed
- ✅ Simulates order progression automatically
- ✅ Sends status update DMs
- ✅ Full testing capability
- ✅ Address is optional
- ✅ No actual charges

### Database Integration
- Orders are stored in MySQL for persistence
- Bot restarts will resume active order simulations
- Order history is permanent and queryable

### Interactive UI
- Select menus for size, crust, and toppings
- Live price calculation as you build
- Confirmation modal before placing order
- Pagination for order history

### Funny Baba Responses
Throughout the ordering process, you'll see random Baba-style messages like:
- "BABA ORDERS PIZZA FOR YOU! 🍕"
- "PIZZA IS COMING! BABA IS EXCITED! 🎉"
- "BABA SMELLS THE PIZZA! 🔥"
- "THE OVEN IS WORKING HARD! ♨️"

## Troubleshooting

### No tables exist error
- Make sure you ran the SQL schema (pizza_schema.sql)
- Check your database connection in babotdata.json

### /pizza command not found
- Run `node deployCommands.js` to register commands
- Restart the bot

### No status updates
- Check console for errors
- Verify global.dbAccess is enabled
- Check that the bot can DM you (you may need to enable DMs from server members)

### Pizza images not appearing
- Add images to `Data/PizzaImages/`
- Ensure they're named correctly (0.jpg, 1.jpg, etc.)
- Check file permissions

## Future: Real Mode Setup

When you're ready to place **real** Domino's orders:

1. Obtain Domino's API credentials
2. Update the database config:
   ```sql
   UPDATE pizza_config SET ConfigValue = 'YOUR_API_KEY' WHERE ConfigKey = 'dominos_api_key';
   UPDATE pizza_config SET ConfigValue = 'YOUR_STORE_ID' WHERE ConfigKey = 'default_store_id';
   UPDATE pizza_config SET ConfigValue = 'false' WHERE ConfigKey = 'mock_mode';
   ```
3. Uncomment the real API code in `Functions/HelperFunctions/dominosHelpers.js`
4. Add safety checks:
   - Rate limiting (1 order/hour per user) ✅ Already implemented in code
   - Maximum order value ($50) ✅ Can be added
   - Admin notifications for real orders ✅ Can be added
   - Address validation required

**⚠️ WARNING:** Real mode will place actual orders and charge real money!

## Architecture Overview

### File Structure
```
Functions/
├── pizzaFunctions.js              # Core ordering logic & embeds
├── Pizza/
│   ├── pizzaOrderManager.js       # State management (JSON + DB sync)
│   ├── pizzaMenuData.js           # Menu items, prices, validation
│   └── pizzaMockSimulator.js      # Mock order status progression
├── Database/
│   └── databasePizzaController.js # Database operations
└── HelperFunctions/
    └── dominosHelpers.js          # Domino's API wrapper

Commands/
└── pizza.js                        # /pizza slash command

Data/
├── pizzaOrders.json               # Order cache (auto-created)
└── PizzaImages/                   # Pizza images (you add these)
```

### Data Flow
1. User runs `/pizza` → Shows menu buttons
2. User clicks "New Order" → Shows select menus
3. User selects options → Live price updates
4. User clicks "Place Order" → Modal shown
5. User submits modal → Order created in database
6. Mock simulator starts → Status progresses automatically
7. User receives DMs → Status updates with embeds
8. Order completes → Status "Delivered", simulation stops

## Support

If you encounter issues:
1. Check the console for error messages
2. Verify database connection and tables exist
3. Ensure bot has permission to DM users
4. Check that global.dbAccess is enabled

Enjoy your Baba Pizza Ordering Service! 🍕
