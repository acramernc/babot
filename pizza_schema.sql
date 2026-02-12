-- Baba Pizza Ordering Service Database Schema
-- Run this file in your MySQL database to create the necessary tables

-- Table: pizza_orders
-- Stores all pizza orders with tracking information
CREATE TABLE IF NOT EXISTS pizza_orders (
    OrderID VARCHAR(36) PRIMARY KEY,
    UserID VARCHAR(20) NOT NULL,
    GuildID VARCHAR(20) NOT NULL,
    OrderDate DATETIME NOT NULL,
    Size VARCHAR(20) NOT NULL,
    Crust VARCHAR(30) NOT NULL,
    Toppings TEXT,
    SpecialInstructions TEXT,
    Address TEXT,
    OrderStatus VARCHAR(20) NOT NULL,
    EstimatedDelivery DATETIME,
    ActualDelivery DATETIME,
    Price DECIMAL(10,2),
    DominosOrderID VARCHAR(50),
    IsMockOrder BOOLEAN DEFAULT TRUE,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_date (UserID, OrderDate),
    INDEX idx_status (OrderStatus)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Table: pizza_config
-- Stores pizza service configuration settings
CREATE TABLE IF NOT EXISTS pizza_config (
    ConfigKey VARCHAR(50) PRIMARY KEY,
    ConfigValue TEXT NOT NULL,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Insert default configuration values
INSERT INTO pizza_config (ConfigKey, ConfigValue) VALUES
('mock_mode', 'true'),
('dominos_api_key', ''),
('default_store_id', ''),
('enable_tracking', 'true')
ON DUPLICATE KEY UPDATE ConfigValue=VALUES(ConfigValue);
