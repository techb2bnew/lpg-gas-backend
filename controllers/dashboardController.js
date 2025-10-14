const { Op, fn, col, literal, Sequelize } = require('sequelize');
const { User, DeliveryAgent, Agency, Product, Order } = require('../models');
const { createError } = require('../utils/errorHandler');

// Dashboard summary (Admin or Agency Owner)
const getDashboard = async (req, res, next) => {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'agency_owner')) {
      return next(createError(403, 'Admins and Agency Owners only'));
    }

    const isAgencyOwner = req.user.role === 'agency_owner';
    const agencyId = req.user.agencyId;

    // Build filters based on user role
    const commonFilters = isAgencyOwner ? { agencyId } : {};
    const orderFilters = isAgencyOwner ? { agencyId } : {};

    // Totals based on role
    let [totalUsers, totalAgents, totalAgencies, totalProducts, totalOrders] = [null, null, null, null, null];
    
    if (isAgencyOwner) {
      // Agency owner sees only their agency data
      [totalUsers, totalAgents, totalAgencies, totalProducts, totalOrders] = await Promise.all([
        User.count({ where: { role: 'customer' } }), // Total customers across all agencies for orders
        DeliveryAgent.count({ where: { agencyId } }),
        1, // Only their own agency
        Product.count(),
        Order.count({ where: orderFilters })
      ]);
    } else {
      // Admin sees all data
      [totalUsers, totalAgents, totalAgencies, totalProducts, totalOrders] = await Promise.all([
        User.count({ where: { role: 'customer' } }),
        DeliveryAgent.count(),
        Agency.count(),
        Product.count(),
        Order.count()
      ]);
    }

    // Users breakdown (same for both admin and agency owner)
    const [activeUsers, blockedUsers, registeredUsers] = await Promise.all([
      User.count({ where: { role: 'customer', isBlocked: false } }),
      User.count({ where: { role: 'customer', isBlocked: true } }),
      User.count({ where: { role: 'customer', registeredAt: { [Op.ne]: null } } })
    ]);

    // Agencies breakdown
    let [activeAgencies, inactiveAgencies] = [1, 0]; // Default values for agency owner
    if (!isAgencyOwner) {
      [activeAgencies, inactiveAgencies] = await Promise.all([
        Agency.count({ where: { status: 'active' } }),
        Agency.count({ where: { status: 'inactive' } })
      ]);
    }

    // Products breakdown
    const [activeProducts, inactiveProducts] = await Promise.all([
      Product.count({ where: { status: 'active' } }),
      Product.count({ where: { status: 'inactive' } })
    ]);

    // Orders by status - filter by agency for agency owners
    const orderStatuses = ['pending', 'confirmed', 'assigned', 'out_for_delivery', 'delivered', 'cancelled'];
    const ordersByStatusRows = await Order.findAll({
      attributes: ['status', [fn('COUNT', col('Order.id')), 'count']],
      where: orderFilters,
      group: ['status']
    });
    const ordersByStatus = Object.fromEntries(orderStatuses.map(s => [s, 0]));
    for (const row of ordersByStatusRows) {
      ordersByStatus[row.get('status')] = parseInt(row.get('count'), 10);
    }

    // Orders per agent (counts by status) - filter by agency for agency owners
    const ordersPerAgent = await Order.findAll({
      attributes: [
        'assignedAgentId',
        [fn('COUNT', col('Order.id')), 'totalOrders'],
        [fn('SUM', literal("CASE WHEN \"Order\".\"status\"='pending' THEN 1 ELSE 0 END")), 'pending'],
        [fn('SUM', literal("CASE WHEN \"Order\".\"status\"='confirmed' THEN 1 ELSE 0 END")), 'confirmed'],
        [fn('SUM', literal("CASE WHEN \"Order\".\"status\"='assigned' THEN 1 ELSE 0 END")), 'assigned'],
        [fn('SUM', literal("CASE WHEN \"Order\".\"status\"='out_for_delivery' THEN 1 ELSE 0 END")), 'out_for_delivery'],
        [fn('SUM', literal("CASE WHEN \"Order\".\"status\"='delivered' THEN 1 ELSE 0 END")), 'delivered'],
        [fn('SUM', literal("CASE WHEN \"Order\".\"status\"='cancelled' THEN 1 ELSE 0 END")), 'cancelled']
      ],
      where: orderFilters,
      include: [{ model: DeliveryAgent, as: 'DeliveryAgent', attributes: ['id', 'name', 'email', 'phone', 'status'] }],
      group: [
        'assignedAgentId',
        'DeliveryAgent.id',
        'DeliveryAgent.name',
        'DeliveryAgent.email',
        'DeliveryAgent.phone',
        'DeliveryAgent.status'
      ]
    });

    // Recent orders with assignment - filter by agency for agency owners
    const recentOrders = await Order.findAll({
      where: orderFilters,
      order: [['createdAt', 'DESC']],
      limit: 20,
      include: [{ model: DeliveryAgent, as: 'DeliveryAgent', attributes: ['id', 'name', 'email', 'phone'] }]
    });

    // Build response
    return res.status(200).json({
      success: true,
      message: 'Dashboard data',
      data: {
        totals: {
          users: totalUsers,
          agents: totalAgents,
          agencies: totalAgencies,
          products: totalProducts,
          orders: totalOrders
        },
        users: {
          active: activeUsers,
          blocked: blockedUsers,
          registered: registeredUsers
        },
        agencies: {
          active: activeAgencies,
          inactive: inactiveAgencies
        },
        products: {
          active: activeProducts,
          inactive: inactiveProducts
        },
        orders: {
          byStatus: ordersByStatus,
          perAgent: ordersPerAgent
        },
        recent: {
          orders: recentOrders
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard
};


