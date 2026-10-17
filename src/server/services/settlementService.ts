/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Settlement & Commission Calculation Service
 * Manages disbursement batching, commission deduction, and payout confirmation.
 */

import { Order, OrderStatus, Settlement, SettlementStatus, Merchant } from '../../types';

export class SettlementService {
  /**
   * Previews eligible completed orders for merchant payout disbursement.
   */
  public static calculateEligibleSettlement(
    merchantId: string,
    completedOrders: Order[],
    commissionPercent: number
  ): {
    orderCount: number;
    totalSales: number;
    totalCommission: number;
    amountToPay: number;
    eligibleOrders: Order[];
  } {
    // Only COMPLETED orders that have not yet been settled
    const eligibleOrders = completedOrders.filter(
      o => o.merchantId === merchantId && o.status === OrderStatus.COMPLETED && !(o as any).isSettled
    );

    const orderCount = eligibleOrders.length;
    const totalSales = eligibleOrders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
    const totalCommission = Math.round((totalSales * (commissionPercent || 10)) / 100);
    const amountToPay = Math.max(0, totalSales - totalCommission);

    return {
      orderCount,
      totalSales,
      totalCommission,
      amountToPay,
      eligibleOrders
    };
  }

  /**
   * Builds a new settlement record with unique ID and snapshot of merchant bank credentials.
   */
  public static buildSettlement(
    merchant: Merchant,
    orderCount: number,
    totalSales: number,
    totalCommission: number,
    amountToPay: number
  ): Omit<Settlement, 'id' | 'createdAt'> {
    return {
      merchantId: merchant.id,
      merchantName: merchant.name,
      orderCount,
      totalSales,
      totalCommission,
      amountToPay,
      status: SettlementStatus.WAITING_CONFIRMATION,
      bankName: merchant.bankName || 'Bank Mandiri',
      bankAccount: merchant.bankAccount || '-',
      bankHolder: merchant.bankHolder || merchant.ownerName
    };
  }
}
