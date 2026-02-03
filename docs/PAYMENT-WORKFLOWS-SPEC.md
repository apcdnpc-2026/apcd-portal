# Payment Workflows for Indian Government Portals -- Technical Specification

**Portal**: APCD OEM Empanelment Portal (NPC / CPCB)
**Stack**: NestJS 10 + Next.js 14 + PostgreSQL 15 (Prisma) + Razorpay
**Version**: 1.0
**Last Updated**: 2026-02-03
**Reference Portals**: PMAY, NPC APCD Portal, CPCB/SPCB Consent Management, OCMMS, Bharat BillPay

---

## Table of Contents

1. [Indian Government Payment Gateways](#1-indian-government-payment-gateways)
2. [Fee Structure](#2-fee-structure)
3. [Payment Flow](#3-payment-flow)
4. [Challan / Receipt Generation](#4-challan--receipt-generation)
5. [Reconciliation](#5-reconciliation)
6. [Refund Handling](#6-refund-handling)
7. [Split Payments](#7-split-payments)
8. [Offline Payment](#8-offline-payment)
9. [GST Integration](#9-gst-integration)
10. [Database Schema](#10-database-schema)
11. [Security](#11-security)
12. [Reporting](#12-reporting)

---

## 1. Indian Government Payment Gateways

### 1.1 Authorized Gateways for Government Portals

Indian government portals are required to use RBI-authorized payment aggregators. The following table summarizes gateways commonly approved for central and state government e-governance portals, their integration models, and typical settlement timelines.

| Gateway                         | Typical Government Users                                         | Integration Model                                           | Settlement Window                         |
| ------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| **Razorpay**                    | NPC, Startup India, GeM, DPIIT                                   | REST API + JavaScript modal checkout                        | T+2 business days                         |
| **BillDesk**                    | MCA21, EPFO, Income Tax, many SPCBs                              | Server-to-server redirect with HMAC pipe-delimited messages | T+1 to T+3                                |
| **PayU**                        | Various state e-Governance portals                               | REST API + hosted checkout page                             | T+2                                       |
| **SBI ePay**                    | CPCB, many SPCBs, state treasuries                               | HTML form POST with AES-encrypted payload                   | T+1 (same bank), T+2 (inter-bank)         |
| **NTRP** (NIC)                  | Central government ministries, PFMS-linked departments           | NIC-hosted portal integrated with PFMS and RBI e-Kuber      | Directly into government treasury account |
| **Bharat BillPay (BBPS)**       | Statutory/utility fee collection (electricity, water, municipal) | NPCI biller registration model via certified BOU            | T+1                                       |
| **UPI (Collect / Intent / QR)** | Cross-cutting; available through all major aggregators           | Via aggregator SDK or direct PSP API                        | Near real-time (seconds to minutes)       |

### 1.2 Current Portal Implementation -- Razorpay Standard Checkout

The APCD Portal currently uses **Razorpay Standard Checkout**, which is the recommended integration for government portals that do not need to handle raw card data. This places the portal under PCI-DSS **SAQ-A** (the least restrictive self-assessment questionnaire), because card details are captured entirely within Razorpay's hosted iframe and never touch the portal's servers.

**Key configuration values** (from `apps/api/src/modules/payments/payments.service.ts`):

```
RAZORPAY_KEY_ID      -- Public key, safe to expose to the browser
RAZORPAY_KEY_SECRET  -- Server-only secret for HMAC signature verification
```

**Integration pattern (three-phase)**:

```
Phase 1 (Server):  Create order   -->  POST /payments/razorpay/create-order
Phase 2 (Client):  Checkout modal -->  Razorpay JS SDK opens payment overlay
Phase 3 (Server):  Verify payment -->  POST /payments/razorpay/verify
```

### 1.3 Razorpay -- Server-Side Order Creation

Source: `d:\APCD Portal\apcd-portal\apps\api\src\modules\payments\payments.service.ts`, lines 121-159.

```typescript
async createRazorpayOrder(userId: string, dto: RazorpayOrderDto) {
  // 1. Validate that the calling user owns the application
  const application = await this.validateApplicationForPayment(
    dto.applicationId, userId,
  );

  // 2. Generate a locally-unique order identifier
  //    In production, replace with Razorpay Orders API call:
  //    const rzpOrder = await razorpay.orders.create({ amount, currency, receipt });
  const orderId = `order_${crypto.randomBytes(12).toString('hex')}`;

  // 3. Calculate GST-inclusive total
  const gstRate = 18;
  const gstAmount = (dto.baseAmount * gstRate) / 100;
  const totalAmount = dto.baseAmount + gstAmount;

  // 4. Persist Payment record BEFORE calling the gateway (idempotency anchor)
  const payment = await this.prisma.payment.create({
    data: {
      applicationId: dto.applicationId,
      paymentType: dto.paymentType,
      paymentMethod: PaymentMethod.RAZORPAY,
      status: PaymentStatus.INITIATED,
      baseAmount: dto.baseAmount,
      gstRate,
      gstAmount,
      totalAmount,
      apcdTypeCount: dto.apcdTypeCount || 1,
      razorpayOrderId: orderId,
    },
  });

  // 5. Return checkout parameters to the frontend
  //    NOTE: Razorpay expects amount in paise (smallest currency unit)
  return {
    paymentId: payment.id,
    orderId,
    amount: Math.round(totalAmount * 100),
    currency: 'INR',
    keyId: this.razorpayKeyId,
    name: 'NPC APCD Portal',
    description: `${dto.paymentType} for Application`,
    prefill: {
      email: application.applicant.email,
      contact: application.applicant.phone,
    },
  };
}
```

### 1.4 Razorpay -- Client-Side Checkout

Source: `d:\APCD Portal\apcd-portal\apps\web\src\app\payments\checkout\[applicationId]\page.tsx`, lines 35-47 and 132-193.

```typescript
// Dynamic script loader -- avoids loading Razorpay JS until the user is on
// the checkout page. Cached: if window.Razorpay already exists, resolves
// immediately.
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// Checkout handler -- called when the user clicks "Pay Rs X,XX,XXX"
const handleRazorpayPayment = async () => {
  setProcessing(true);

  const loaded = await loadRazorpayScript();
  if (!loaded) {
    /* show error toast, abort */
  }

  // Step 1: Create order via our backend
  const orderData = await createOrderMutation.mutateAsync({
    applicationId,
    paymentType: 'APPLICATION_FEE',
    amount: fees.totalPayable || fees.total,
  });
  const order = orderData?.data || orderData;

  // Step 2: Configure and open the Razorpay modal
  const options = {
    key: order.razorpayKey || process.env.NEXT_PUBLIC_RAZORPAY_KEY,
    amount: order.amount, // in paise
    currency: order.currency || 'INR',
    name: 'NPC - APCD Empanelment',
    description: 'Application & Empanelment Fee',
    order_id: order.orderId || order.razorpayOrderId,
    handler: function (response: any) {
      // Step 3: On success, POST to our verify endpoint
      verifyMutation.mutate({
        razorpayOrderId: response.razorpay_order_id,
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
        applicationId,
      });
    },
    prefill: { email: order.email || '', contact: order.contact || '' },
    theme: { color: '#1e40af' },
    modal: { ondismiss: () => setProcessing(false) },
  };

  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', () => {
    toast({ title: 'Payment failed. Please try again.', variant: 'destructive' });
    setProcessing(false);
  });
  rzp.open();
};
```

### 1.5 Razorpay -- Server-Side Signature Verification

Source: `d:\APCD Portal\apcd-portal\apps\api\src\modules\payments\payments.service.ts`, lines 164-201.

```typescript
async verifyRazorpayPayment(dto: VerifyRazorpayDto) {
  // 1. Look up the Payment record by the Razorpay order ID
  const payment = await this.prisma.payment.findFirst({
    where: { razorpayOrderId: dto.orderId },
    include: { application: true },
  });
  if (!payment) throw new NotFoundException('Payment not found');

  // 2. Compute HMAC-SHA256 of "orderId|paymentId" using the secret key
  const expectedSignature = crypto
    .createHmac('sha256', this.razorpayKeySecret)
    .update(`${dto.orderId}|${dto.paymentId}`)
    .digest('hex');

  // 3. If signature does not match, mark payment FAILED
  if (expectedSignature !== dto.signature) {
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });
    throw new BadRequestException('Invalid payment signature');
  }

  // 4. Signature valid -- mark payment COMPLETED
  const updatedPayment = await this.prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: PaymentStatus.COMPLETED,
      razorpayPaymentId: dto.paymentId,
      razorpaySignature: dto.signature,
      verifiedAt: new Date(),
    },
  });

  // 5. Trigger downstream workflow (move application to UNDER_REVIEW)
  await this.updateApplicationStatusAfterPayment(
    payment.applicationId,
    payment.paymentType,
  );

  return updatedPayment;
}
```

### 1.6 Multi-Gateway Adapter Pattern (Recommended for CPCB/SPCB Portals)

Many Indian environmental portals must support multiple gateways (BillDesk for legacy, SBI ePay for state treasury integration, Razorpay for modern UPI). A **strategy/adapter pattern** is recommended:

```typescript
// Abstract interface -- all gateways implement this contract
interface PaymentGatewayAdapter {
  createOrder(params: CreateOrderParams): Promise<GatewayOrderResult>;
  verifyPayment(params: VerifyParams): Promise<GatewayVerifyResult>;
  initiateRefund(params: RefundParams): Promise<GatewayRefundResult>;
  checkSettlementStatus(txnId: string): Promise<SettlementStatus>;
}

// Concrete implementations
class RazorpayAdapter implements PaymentGatewayAdapter {
  /* ... */
}
class BillDeskAdapter implements PaymentGatewayAdapter {
  /* ... */
}
class SBIePayAdapter implements PaymentGatewayAdapter {
  /* ... */
}
class NTRPAdapter implements PaymentGatewayAdapter {
  /* ... */
}

// Factory resolves the correct adapter from configuration
@Injectable()
class PaymentGatewayFactory {
  create(gateway: GatewayType): PaymentGatewayAdapter {
    switch (gateway) {
      case 'RAZORPAY':
        return new RazorpayAdapter(this.config);
      case 'BILLDESK':
        return new BillDeskAdapter(this.config);
      case 'SBI_EPAY':
        return new SBIePayAdapter(this.config);
      case 'NTRP':
        return new NTRPAdapter(this.config);
      default:
        throw new Error(`Unsupported gateway: ${gateway}`);
    }
  }
}
```

### 1.7 BillDesk Integration Pattern (Reference -- Used by MCA21, EPFO)

BillDesk uses a pipe-delimited message format with HMAC checksum authentication. This pattern is relevant because many SPCBs in India (Maharashtra, Karnataka, Tamil Nadu) use BillDesk for consent fee collection.

```typescript
class BillDeskAdapter implements PaymentGatewayAdapter {
  async createOrder(params: CreateOrderParams): Promise<GatewayOrderResult> {
    // BillDesk message: pipe-delimited fields
    const msg = [
      '0300', // Message type: payment request
      this.merchantId, // Assigned by BillDesk during onboarding
      params.orderId, // Portal-generated unique order reference
      'NA', // Additional info field
      params.amount.toFixed(2), // Amount with 2 decimal places
      'INR', // Currency code
      params.returnUrl, // Portal callback URL
      'NA',
      'NA',
      'NA', // Reserved fields
      this.securityId, // Security credential from BillDesk
    ].join('|');

    // Append HMAC checksum
    const checksum = crypto.createHmac('sha256', this.hmacKey).update(msg).digest('hex');
    const fullMsg = `${msg}|${checksum}`;

    // Return redirect parameters -- frontend will POST this form
    return {
      redirectUrl: this.billDeskPaymentUrl,
      method: 'POST',
      formData: { msg: fullMsg },
    };
  }

  async verifyPayment(params: { responseMsg: string }): Promise<GatewayVerifyResult> {
    const parts = params.responseMsg.split('|');
    const receivedChecksum = parts[parts.length - 1];
    const msgBody = parts.slice(0, -1).join('|');

    // Verify HMAC
    const expectedChecksum = crypto
      .createHmac('sha256', this.hmacKey)
      .update(msgBody)
      .digest('hex');

    if (receivedChecksum !== expectedChecksum) {
      throw new Error('BillDesk checksum verification failed');
    }

    // Parse response fields (BillDesk response format)
    return {
      orderId: parts[1],
      txnId: parts[2],
      txnAmount: parseFloat(parts[4]),
      status: parts[14] === '0300' ? 'SUCCESS' : 'FAILED',
      authStatus: parts[14],
      bankReferenceNo: parts[5],
    };
  }
}
```

### 1.8 SBI ePay Integration Pattern (Reference -- Used by Many SPCBs)

SBI ePay is the standard gateway for state government portals that bank with SBI. It uses AES-encrypted form POST parameters.

```typescript
class SBIePayAdapter implements PaymentGatewayAdapter {
  async createOrder(params: CreateOrderParams): Promise<GatewayOrderResult> {
    const payload = JSON.stringify({
      merchantCode: this.merchantCode,
      orderNo: params.orderId,
      amount: params.amount.toFixed(2),
      currency: 'INR',
      returnUrl: params.returnUrl,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      customerPhone: params.customerPhone,
    });

    // AES-256-CBC encryption with SBI-provided key
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.aesKey, iv);
    let encrypted = cipher.update(payload, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    return {
      redirectUrl: `${this.sbiGatewayUrl}/sbiepay/payment`,
      method: 'POST',
      formData: {
        EncryptedPaymentData: encrypted,
        IV: iv.toString('base64'),
        MerchantCode: this.merchantCode,
      },
    };
  }
}
```

### 1.9 NTRP (National Treasury Receipt Portal) Pattern

NTRP is mandated for departments that credit fees directly to the Consolidated Fund of India via the Public Financial Management System (PFMS). Payments through NTRP settle directly into the government treasury account rather than into a merchant settlement account.

```typescript
class NTRPAdapter implements PaymentGatewayAdapter {
  async createOrder(params: CreateOrderParams): Promise<GatewayOrderResult> {
    const ntrpRequest = {
      departmentId: this.deptId, // Department code (CPCB/NPC)
      headOfAccount: '0052-00-104-01', // Budget head for environmental fees
      subHead: params.feeType,
      amount: params.amount,
      payerName: params.customerName,
      payerAddress: params.customerAddress,
      purposeOfPayment: params.description,
      challanDate: new Date().toISOString(),
      returnUrl: params.returnUrl,
    };

    // NTRP returns a challan number and a redirect URL for payment
    const response = await this.httpClient.post(
      `${this.ntrpBaseUrl}/api/v1/challan/create`,
      ntrpRequest,
      { headers: { 'X-API-Key': this.apiKey } },
    );

    return {
      challanNo: response.data.challanNo,
      redirectUrl: response.data.paymentUrl,
      method: 'GET',
    };
  }
}
```

### 1.10 UPI Integration

UPI is available through all major aggregators (Razorpay, BillDesk, PayU) and requires no separate integration when using their checkout SDKs. The Razorpay Standard Checkout already supports:

- **UPI ID / VPA** -- User enters their UPI address (e.g., `user@upi`)
- **UPI QR Code** -- Scan-to-pay QR displayed in the checkout modal
- **UPI Intent** -- Deep-links to UPI apps on mobile (Google Pay, PhonePe, Paytm)

No additional code is required in the APCD Portal for UPI support.

---

## 2. Fee Structure

### 2.1 APCD Portal Fee Schedule

Source: `d:\APCD Portal\apcd-portal\packages\shared\src\constants\fee-structure.ts`

| Fee Type           | Base Amount (INR) | Calculation Rule                        | SOP Reference   |
| ------------------ | ----------------- | --------------------------------------- | --------------- |
| Application Fee    | 25,000            | Fixed, one-time, non-refundable         | SOP Section 5.1 |
| Empanelment Fee    | 65,000            | Per APCD model type seeking empanelment | SOP Section 5.2 |
| Field Verification | 57,000            | Per application                         | SOP Section 5.3 |
| Emission Testing   | Actuals           | Based on lab invoices                   | SOP Section 5.4 |
| Annual Renewal     | 35,000            | Per year, due before certificate expiry | SOP Section 5.5 |
| Surveillance Visit | Actuals           | As required by NPC                      | SOP Section 5.6 |

```typescript
// Source: packages/shared/src/constants/fee-structure.ts
export const FEE_AMOUNTS: Record<PaymentType, number> = {
  [PaymentType.APPLICATION_FEE]: 25000,
  [PaymentType.EMPANELMENT_FEE]: 65000, // Per APCD model type
  [PaymentType.FIELD_VERIFICATION]: 57000,
  [PaymentType.EMISSION_TESTING]: 0, // Charged on actuals
  [PaymentType.ANNUAL_RENEWAL]: 35000,
  [PaymentType.SURVEILLANCE_VISIT]: 0, // Charged on actuals
};
```

### 2.2 GST Application

```typescript
export const GST_RATE = 18; // 18% GST applied to all fees
```

GST is applied to the amount-after-discount. For intra-state transactions (NPC is registered in Delhi, state code `07`), this splits as 9% CGST + 9% SGST. For inter-state transactions, it is 18% IGST.

### 2.3 Discount Policy

```typescript
export const DISCOUNT_PERCENT = 15;

export const DISCOUNT_ELIGIBLE_FEE_TYPES: PaymentType[] = [
  PaymentType.APPLICATION_FEE,
  PaymentType.EMPANELMENT_FEE,
  PaymentType.ANNUAL_RENEWAL,
];
```

**Eligibility** (checked from `OemProfile`):

- `isMSE` -- Micro and Small Enterprises (Udyam-registered)
- `isStartup` -- DPIIT-recognized startups
- `isLocalSupplier` -- Class-I Local Suppliers (>50% local content)

**Important**: Discount benefits are not cumulative. Maximum discount is 15% regardless of how many criteria an OEM satisfies. As per the current SOP, the full fee is collected upfront and the 15% is refunded after Final Certificate issuance.

### 2.4 Fee Calculation Algorithm

Source: `d:\APCD Portal\apcd-portal\packages\shared\src\constants\fee-structure.ts`, function `calculateFee`.

```
Input:  paymentType, quantity, isDiscountEligible

1.  baseAmount      = FEE_AMOUNTS[paymentType]
2.  subtotal        = baseAmount * quantity
3.  discountPercent = (isDiscountEligible AND paymentType in DISCOUNT_ELIGIBLE_FEE_TYPES) ? 15 : 0
4.  discountAmount  = round(subtotal * discountPercent / 100)
5.  afterDiscount   = subtotal - discountAmount
6.  gstAmount       = round(afterDiscount * 18 / 100)
7.  totalAmount     = afterDiscount + gstAmount

Output: { baseAmount, quantity, subtotal, discountPercent, discountAmount,
          amountAfterDiscount, gstRate, gstAmount, totalAmount }
```

**Worked example** (from SOP): OEM seeking empanelment for 5 APCD types, MSE-eligible:

```
Application Fee:
  Base:      25,000 x 1     =    25,000
  Discount:  25,000 x 15%   =     3,750
  After:     25,000 - 3,750 =    21,250
  GST:       21,250 x 18%   =     3,825
  Total:     21,250 + 3,825 =    25,075

Empanelment Fee:
  Base:      65,000 x 5     =  3,25,000
  Discount:  3,25,000 x 15% =    48,750
  After:     3,25,000-48,750=  2,76,250
  GST:       2,76,250 x 18% =    49,725
  Total:     2,76,250+49,725=  3,25,975

Grand Total:                =  3,51,050
```

The server-side calculation (from `PaymentsService.calculateFees`) follows the same logic but with a design choice that the discount is NOT applied upfront; instead, the `refundAmount` is computed and communicated to the OEM:

```typescript
// Source: payments.service.ts, lines 61-103
const refundAmount = isDiscountEligible
  ? (applicationFeeBase + empanelmentFeeBase * apcdCount) * 0.15
  : 0;
```

### 2.5 Dynamic Fee Calculation for CPCB/SPCB Consent Portals (Generalized)

Environmental regulatory portals (OCMMS, PCB consent portals) use more complex fee structures based on industry classification and capital investment. The following is the generalized pattern:

```typescript
// Fee varies by: state, industry category (RED/ORANGE/GREEN/WHITE),
// scale (LARGE/MEDIUM/SMALL/MICRO), capital investment, and consent type.

interface ConsentFeeParams {
  consentType: 'CTE' | 'CTO' | 'RENEWAL' | 'AMENDMENT';
  industryCategory: 'RED' | 'ORANGE' | 'GREEN' | 'WHITE';
  industryScale: 'LARGE' | 'MEDIUM' | 'SMALL' | 'MICRO';
  capitalInvestmentLakhs: number;
  waterConsumptionKLD?: number;
  isHazardousWaste: boolean;
  stateCode: string;
}

function calculateConsentFee(params: ConsentFeeParams): FeeBreakdown {
  // 1. Load state-specific fee schedule from database
  const schedule = getFeeSchedule(params.stateCode, params.industryCategory);

  // 2. Base fee from schedule
  let fee = schedule.baseFee;

  // 3. Capital investment slab surcharge
  for (const slab of schedule.investmentSlabs) {
    if (params.capitalInvestmentLakhs >= slab.min && params.capitalInvestmentLakhs <= slab.max) {
      fee += params.capitalInvestmentLakhs * slab.ratePerLakh;
      break;
    }
  }

  // 4. Hazardous waste surcharge
  if (params.isHazardousWaste) {
    fee += schedule.hazardousWasteSurcharge;
  }

  // 5. Consent type multiplier (renewals are typically 50-75% of new consent)
  if (params.consentType === 'RENEWAL') {
    fee *= schedule.renewalMultiplier;
  }

  // 6. GST
  const gst = Math.round(fee * 0.18);

  return { baseFee: fee, gstAmount: gst, totalAmount: fee + gst };
}
```

### 2.6 Database-Driven Fee Configuration

Source: `d:\APCD Portal\apcd-portal\packages\database\prisma\schema.prisma`, lines 806-817.

```prisma
model FeeConfiguration {
  id              String      @id @default(uuid())
  paymentType     PaymentType @map("payment_type") @unique
  baseAmount      Decimal     @map("base_amount")
  gstRate         Decimal     @default(18) @map("gst_rate")
  discountPercent Decimal     @default(15) @map("discount_percent")
  description     String?
  isActive        Boolean     @default(true) @map("is_active")
  updatedAt       DateTime    @updatedAt @map("updated_at")
  @@map("fee_configurations")
}
```

For SPCB-style portals with slab-based fees, the following extended model is recommended:

```prisma
model FeeSchedule {
  id                String   @id @default(uuid())
  stateCode         String   @map("state_code")         // 'MH', 'KA', 'DL'
  feeCategory       String   @map("fee_category")       // 'CTE', 'CTO', 'RENEWAL'
  industryCategory  String   @map("industry_category")  // 'RED', 'ORANGE', 'GREEN'
  industryScale     String   @map("industry_scale")     // 'LARGE', 'MEDIUM', 'SMALL'
  slabMinCapital    Decimal? @map("slab_min_capital")    // In lakhs
  slabMaxCapital    Decimal? @map("slab_max_capital")
  baseFee           Decimal  @map("base_fee")
  perLakhRate       Decimal? @map("per_lakh_rate")
  gstRate           Decimal  @default(18) @map("gst_rate")
  effectiveFrom     DateTime @map("effective_from")
  effectiveTo       DateTime? @map("effective_to")
  isActive          Boolean  @default(true) @map("is_active")
  createdAt         DateTime @default(now()) @map("created_at")

  @@unique([stateCode, feeCategory, industryCategory, industryScale, effectiveFrom])
  @@map("fee_schedules")
}
```

---

## 3. Payment Flow

### 3.1 Complete Payment Lifecycle Diagram

```
                     ONLINE (Razorpay)                    OFFLINE (NEFT/RTGS)
                     ================                    ===================

  +------------------+                          +------------------+
  |  1. Fee          |                          |  1. Fee          |
  |  Calculation     |                          |  Calculation     |
  |  GET /payments/  |                          |  GET /payments/  |
  |  calculate/:id   |                          |  calculate/:id   |
  +--------+---------+                          +--------+---------+
           |                                             |
           v                                             v
  +------------------+                          +------------------+
  |  2. Create Order |                          |  2. Display NPC  |
  |  POST /payments/ |                          |  Bank Details    |
  |  razorpay/       |                          |  GET /payments/  |
  |  create-order    |                          |  bank-details    |
  +--------+---------+                          +--------+---------+
           |                                             |
           v                                             v
  +------------------+                          +------------------+
  |  3. Razorpay     |                          |  3. OEM transfers|
  |  Checkout Modal  |                          |  via NEFT/RTGS   |
  |  (client-side)   |                          |  (external bank) |
  +--------+---------+                          +--------+---------+
           |                                             |
           v                                             v
  +------------------+                          +------------------+
  |  4. Signature    |                          |  4. Record       |
  |  Verification    |                          |  Payment Proof   |
  |  POST /payments/ |                          |  POST /payments/ |
  |  razorpay/verify |                          |  manual          |
  +--------+---------+                          +--------+---------+
           |                                             |
           v                                             v
  +------------------+                          +------------------+
  |  5. Status:      |                          |  5. Status:      |
  |  COMPLETED       |                          |  VERIFICATION_   |
  |  (instant)       |                          |  PENDING         |
  +--------+---------+                          +--------+---------+
           |                                             |
           |                                             v
           |                                    +------------------+
           |                                    |  6. Officer      |
           |                                    |  Verification    |
           |                                    |  PUT /payments/  |
           |                                    |  :id/verify      |
           |                                    +--------+---------+
           |                                             |
           +-------------------+-----+-------------------+
                               |     |
                               v     v
                      +------------------+
                      |  7. Application  |
                      |  Status Update   |
                      |  SUBMITTED -->   |
                      |  UNDER_REVIEW    |
                      +--------+---------+
                               |
                               v
                      +------------------+
                      |  8. Receipt      |
                      |  Generation      |
                      |  + Notification  |
                      |  + Audit Log     |
                      +------------------+
```

### 3.2 Online Payment Flow -- Step by Step

**Step 1: Fee Calculation**

Endpoint: `GET /payments/calculate/:applicationId`
Role: OEM
Source: `PaymentsService.calculateFees()`, lines 61-103

The service loads the application with its APCD selections and OEM profile, determines discount eligibility, and computes the fee breakdown.

```
Request:  GET /api/payments/calculate/550e8400-e29b-41d4-a716-446655440000
          Authorization: Bearer <OEM JWT>

Response: {
  "applicationFee":  { "baseAmount": 25000, "gstRate": 18, "gstAmount": 4500, "total": 29500 },
  "empanelmentFee":  { "baseAmount": 195000, "gstRate": 18, "gstAmount": 35100, "total": 230100 },
  "grandTotal":      259600,
  "isDiscountEligible": true,
  "refundAmount":    33000,
  "apcdCount":       3
}
```

**Step 2: Order Creation**

Endpoint: `POST /payments/razorpay/create-order`
Role: OEM

```
Request:  POST /api/payments/razorpay/create-order
          { "applicationId": "...", "paymentType": "APPLICATION_FEE", "baseAmount": 25000 }

Response: {
  "paymentId": "uuid-of-payment-record",
  "orderId": "order_a1b2c3d4e5f6...",
  "amount": 2950000,    // 29,500 in paise
  "currency": "INR",
  "keyId": "rzp_live_XXXXXX"
}
```

**Step 3: Gateway Checkout**

The frontend opens the Razorpay modal. The user selects a payment method (UPI, card, net banking, wallet) and completes the payment entirely within Razorpay's iframe.

**Step 4: Signature Verification**

Endpoint: `POST /payments/razorpay/verify`
Role: OEM

The Razorpay modal returns `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`. The server computes:

```
expected = HMAC-SHA256(
  key  = RAZORPAY_KEY_SECRET,
  data = "<razorpay_order_id>|<razorpay_payment_id>"
)
```

If `expected === razorpay_signature`, payment is authentic. The Payment record transitions from `INITIATED` to `COMPLETED`.

**Step 5: Post-Payment Workflow**

Source: `PaymentsService.updateApplicationStatusAfterPayment()`, lines 396-426.

If the application is in `SUBMITTED` status and the payment type is `APPLICATION_FEE` or `EMPANELMENT_FEE`, the application automatically transitions to `UNDER_REVIEW` with an audit trail entry in `ApplicationStatusHistory`.

### 3.3 Offline Payment Flow -- Step by Step

**Step 1: Fee Calculation** -- Same as online flow.

**Step 2: Display Bank Details**

Endpoint: `GET /payments/bank-details`

Source: `d:\APCD Portal\apcd-portal\packages\shared\src\types\payment.types.ts`, lines 45-54.

```typescript
export const NPC_BANK_DETAILS = {
  accountHolder: 'NATIONAL PRODUCTIVITY COUNCIL',
  accountNumber: '026501000009207',
  bankName: 'Indian Overseas Bank',
  branch: 'Golf Link Branch, 70 Golf Link, New Delhi - 110003',
  ifscCode: 'IOBA0000265',
  gstin: '07AAATN0402F1Z8',
  pan: 'AAATN0402F',
} as const;
```

The frontend displays these details with "copy to clipboard" buttons for each field.

**Step 3: OEM Transfers via Bank**

The OEM logs into their own bank portal and initiates an NEFT or RTGS transfer to the NPC account.

**Step 4: Record Payment Proof**

Endpoint: `POST /payments/manual`
Role: OEM

Source: `d:\APCD Portal\apcd-portal\packages\shared\src\validators\payment.validator.ts`, lines 22-37.

```typescript
export const submitManualPaymentSchema = z.object({
  applicationId: z.string().uuid(),
  paymentType: z.enum([
    'APPLICATION_FEE',
    'EMPANELMENT_FEE',
    'FIELD_VERIFICATION',
    'EMISSION_TESTING',
    'ANNUAL_RENEWAL',
    'SURVEILLANCE_VISIT',
  ]),
  utrNumber: z.string().min(5, 'UTR/NEFT number is required'),
  remitterBankName: z.string().min(2, 'Remitter bank name is required'),
  neftAmount: z.number().positive('Amount must be positive'),
  neftDate: z.string().min(1, 'Payment date is required'),
  apcdTypeCount: z.number().int().min(1).default(1),
});
```

The payment record is created with status `VERIFICATION_PENDING`. Optionally, the OEM uploads a scan of the bank transfer receipt as a `PAYMENT_PROOF` document.

**Step 5: Officer Verification**

Endpoint: `GET /payments/pending-verification` (to list)
Endpoint: `PUT /payments/:id/verify` (to approve/reject)
Role: OFFICER, ADMIN, DEALING_HAND

The officer cross-checks the UTR number against the bank statement, verifies the amount matches, and marks the payment as `VERIFIED` or `FAILED`.

Source: `PaymentsService.verifyManualPayment()`, lines 235-274.

**Step 6: Application Advancement** -- Same as online flow Step 5.

### 3.4 Idempotency and Double-Payment Prevention

```typescript
// Recommended check before creating a new order:
async createRazorpayOrder(userId: string, dto: RazorpayOrderDto) {
  // Guard: Check for existing active payment of the same type
  const existing = await this.prisma.payment.findFirst({
    where: {
      applicationId: dto.applicationId,
      paymentType: dto.paymentType,
      status: { in: ['INITIATED', 'COMPLETED', 'VERIFIED'] },
    },
  });

  if (existing?.status === 'COMPLETED' || existing?.status === 'VERIFIED') {
    throw new BadRequestException('Payment already completed for this fee type');
  }

  // If INITIATED but abandoned (>30 minutes old), expire it
  if (existing?.status === 'INITIATED') {
    const ageMinutes = (Date.now() - existing.createdAt.getTime()) / 60000;
    if (ageMinutes < 30) {
      return existing; // Reuse the existing order
    }
    await this.prisma.payment.update({
      where: { id: existing.id },
      data: { status: PaymentStatus.FAILED },
    });
  }

  // Proceed to create new order...
}
```

Additionally, the Razorpay `receipt` parameter can be set to `${applicationId}_${paymentType}` to enable gateway-side deduplication.

### 3.5 Payment Status State Machine

```
              +--------+
              | PENDING |  (initial state, before any action)
              +----+---+
                   |
                   v
             +-----------+
             | INITIATED |  (Razorpay order created OR NEFT details submitted)
             +-----+-----+
                   |
           +-------+--------+
           |                 |
           v                 v
     +-----------+    +--------------------+
     | COMPLETED |    | VERIFICATION_      |  (NEFT/RTGS only)
     | (Razorpay |    | PENDING            |
     |  verified)|    | (awaiting officer) |
     +-----+-----+    +--------+----------+
           |                    |
           |            +-------+-------+
           |            |               |
           |            v               v
           |      +----------+    +--------+
           |      | VERIFIED |    | FAILED |
           |      | (officer |    | (sig   |
           |      |  approved)|   |  fail/ |
           |      +-----+----+   | reject)|
           |            |         +--------+
           +------+-----+
                  |
                  v
            +-----------+
            | REFUNDED  |  (if refund processed)
            +-----------+
```

---

## 4. Challan / Receipt Generation

### 4.1 Indian Government Challan Format

Government payment receipts in India follow the TR-6 challan format or its digital equivalent used by NTRP/PFMS. The receipt must contain the following mandatory fields:

```typescript
interface GovtPaymentReceipt {
  // ── Header ────────────────────────────────────────
  receiptNumber: string; // Format: NPC/2025-26/PAY/000042
  receiptDate: Date;
  financialYear: string; // Indian FY: '2025-26' (Apr-Mar)

  // ── Payer Details ─────────────────────────────────
  payerName: string; // OEM company name
  payerAddress: string;
  payerGSTIN: string; // e.g., '27AAACR5055K1ZO'
  payerPAN: string; // e.g., 'AAACR5055K'

  // ── Payee (Government Entity) ─────────────────────
  payeeName: string; // 'National Productivity Council'
  payeeMinistry: string; // 'Ministry of Commerce & Industry'
  payeeGSTIN: string; // '07AAATN0402F1Z8'
  payeePAN: string; // 'AAATN0402F'
  headOfAccount: string; // Budget head: '0052-00-104-01'

  // ── Payment Details ───────────────────────────────
  purposeOfPayment: string; // 'APCD OEM Empanelment - Application Fee'
  applicationReference: string; // 'APCD-2025-0042'

  // ── Amount Breakdown ──────────────────────────────
  baseAmount: number;
  cgstAmount: number; // 9% (intra-state)
  sgstAmount: number; // 9% (intra-state)
  igstAmount: number; // 18% (inter-state, mutually exclusive with CGST+SGST)
  totalAmount: number;
  amountInWords: string; // 'Rupees Twenty Nine Thousand Five Hundred Only'

  // ── Transaction ───────────────────────────────────
  paymentMethod: string; // 'RAZORPAY' | 'NEFT' | 'RTGS'
  transactionId: string; // razorpay_payment_id or UTR number
  transactionDate: Date;
  bankName: string;
  bankReferenceNumber: string;

  // ── Verification ──────────────────────────────────
  qrCodeData: string; // URL for public receipt verification
  digitalSignatureInfo: string; // Signer name + timestamp
}
```

### 4.2 Unique Receipt Number Generation

Indian government receipts use a sequential numbering scheme within each financial year (April to March):

```typescript
// Receipt format: {ORG}/{FY}/{PREFIX}/{SERIAL}
// Example:        NPC/2025-26/PAY/000042

class ReceiptNumberService {
  /**
   * Indian financial year: April to March
   * January 2026 = FY 2025-26
   * April 2026   = FY 2026-27
   */
  private getFinancialYear(date: Date = new Date()): string {
    const month = date.getMonth(); // 0-indexed (0 = January)
    const year = date.getFullYear();
    if (month >= 3) {
      // April (month 3) onwards
      return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
    }
    return `${year - 1}-${String(year % 100).padStart(2, '0')}`;
  }

  /**
   * Generates the next sequential receipt number.
   * Uses a PostgreSQL sequence to guarantee atomicity under concurrency.
   */
  async generateReceiptNumber(): Promise<string> {
    const fy = this.getFinancialYear();

    // Atomic counter using database sequence
    const result = await this.prisma.$queryRaw<[{ nextval: bigint }]>`
      SELECT nextval('receipt_number_seq')
    `;
    const serial = String(result[0].nextval).padStart(6, '0');

    return `NPC/${fy}/PAY/${serial}`;
  }
}
```

The corresponding PostgreSQL sequence:

```sql
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  NO CYCLE;
```

### 4.3 QR Code on Receipts

Each receipt contains a QR code that encodes a verification URL. When scanned, it opens a public page confirming the payment's authenticity.

```typescript
import * as QRCode from 'qrcode';

class ReceiptQRService {
  async generateQR(payment: Payment): Promise<string> {
    // Verification URL -- publicly accessible, no auth required
    const verificationUrl = `${this.config.get('APP_URL')}/verify/payment/${payment.id}`;

    // QR payload includes essential fields for offline verification
    const qrPayload = JSON.stringify({
      url: verificationUrl,
      receipt: payment.receiptNumber,
      amount: Number(payment.totalAmount),
      date: payment.verifiedAt?.toISOString(),
      app: payment.application?.applicationNumber,
    });

    // Generate as base64 PNG, error correction level HIGH for government docs
    const qrBase64 = await QRCode.toDataURL(qrPayload, {
      width: 200,
      margin: 2,
      errorCorrectionLevel: 'H',
    });

    return qrBase64; // data:image/png;base64,...
  }
}
```

### 4.4 Digital Signatures on Receipts

Indian government receipts require digital signatures using one of these mechanisms:

1. **DSC (Digital Signature Certificate)** -- Class 2 or Class 3 certificate from a CCA-authorized Certifying Authority (e.g., eMudhra, Sify, NIC CA)
2. **Aadhaar eSign** -- Via DigiLocker / NIC eSign API
3. **Server-side PDF signing** -- Using the organization's DSC loaded on the server

```typescript
import * as forge from 'node-forge';

class ReceiptSigningService {
  /**
   * Sign a PDF buffer using the organization's PKCS#12 (.p12) DSC file.
   * The .p12 file contains the private key and certificate chain.
   */
  async signPDF(pdfBuffer: Buffer): Promise<Buffer> {
    const p12Path = this.config.get('DSC_P12_PATH');
    const p12Password = this.config.get('DSC_PASSWORD');

    const p12Buffer = fs.readFileSync(p12Path);
    const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, p12Password);

    // Extract certificate and private key
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const cert = certBags[forge.pki.oids.certBag]![0].cert!;
    const key = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]![0].key!;

    // Use a PDF signing library (e.g., node-signpdf, pdf-lib with PKCS#7)
    // to embed a visible signature block with:
    //   - Signer: "National Productivity Council"
    //   - Timestamp from RFC 3161 TSA
    //   - Certificate chain for verification
    const signedPdf = await this.embedPKCS7Signature(pdfBuffer, cert, key);
    return signedPdf;
  }
}
```

### 4.5 Receipt PDF Template

The receipt is rendered as an HTML template (supporting bilingual Hindi/English as per government norms) and converted to PDF:

```
+----------------------------------------------------------------------+
|                  [Ashoka Emblem]                                      |
|              NATIONAL PRODUCTIVITY COUNCIL                            |
|        (Ministry of Commerce & Industry, Govt. of India)             |
|           APCD OEM Empanelment Portal - Payment Receipt              |
|              भुगतान रसीद / Payment Receipt                            |
+----------------------------------------------------------------------+
| Receipt No: NPC/2025-26/PAY/000042    Date: 03-Feb-2026             |
| Application No: APCD-2025-0042                                       |
+----------------------------------------------------------------------+
| PAYER DETAILS                                                        |
| Name:    M/s XYZ Pollution Control Pvt. Ltd.                        |
| GSTIN:   27AAACR5055K1ZO                                            |
| Address: Plot 42, MIDC Ambad, Nashik, Maharashtra - 422010          |
+----------------------------------------------------------------------+
| PAYMENT DETAILS                                                      |
+--------------------------------------------+----------+--------------+
| Description                                | SAC Code | Amount (INR) |
+--------------------------------------------+----------+--------------+
| Application Processing Fee                 | 998599   |    25,000.00 |
| Empanelment Fee (3 APCD types x Rs 65,000) | 998599   |  1,95,000.00 |
+--------------------------------------------+----------+--------------+
| Taxable Amount                             |          |  2,20,000.00 |
| CGST @ 9%                                  |          |    19,800.00 |
| SGST @ 9%                                  |          |    19,800.00 |
+--------------------------------------------+----------+--------------+
| TOTAL                                      |          |  2,59,600.00 |
+--------------------------------------------+----------+--------------+
| Amount in words: Rupees Two Lakh Fifty Nine Thousand Six Hundred Only|
+----------------------------------------------------------------------+
| Transaction ID: pay_Nc4e6E72HYe1kN  |  Method: Razorpay (Online)   |
| Transaction Date: 03-Feb-2026       |  Bank Ref: 602316XXXXXX      |
+----------------------------------------------------------------------+
|                                                                      |
|  [QR CODE]        Digitally Signed by                                |
|  Scan to verify   NATIONAL PRODUCTIVITY COUNCIL                      |
|                   Date: 03-Feb-2026 14:32:15 IST                     |
|                                                                      |
+----------------------------------------------------------------------+
| This is a computer-generated receipt and does not require a physical |
| signature. Verify at: https://apcd.npc.gov.in/verify/payment/xxxxx  |
+----------------------------------------------------------------------+
```

---

## 5. Reconciliation

### 5.1 Reconciliation Strategy

Payment reconciliation for Indian government portals involves three-way matching:

```
+------------------+     +------------------+     +------------------+
|  Portal Records  |     |  Gateway Records |     |  Bank Statement  |
|  (payments table)|     |  (Razorpay       |     |  (NPC bank       |
|                  |     |   settlements)   |     |   account)       |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         +------------+-----------+----------+-------------+
                      |                      |
                      v                      v
              +--------------+      +-----------------+
              |  Daily Match |      |  Flag Mismatches|
              |  by order_id |      |  AMOUNT_MISMATCH|
              |  and amount  |      |  GATEWAY_ONLY   |
              +--------------+      |  LOCAL_ONLY     |
                                    |  BANK_PENDING   |
                                    +-----------------+
```

### 5.2 Reconciliation Database Model

```prisma
model PaymentReconciliation {
  id                  String    @id @default(uuid())
  reconciliationDate  DateTime  @map("reconciliation_date")
  batchId             String    @map("batch_id")            // 'RECON-2026-02-03'

  // Portal-side record
  paymentId           String?   @map("payment_id")
  ourOrderId          String?   @map("our_order_id")
  ourAmount           Decimal?  @map("our_amount")
  ourStatus           String?   @map("our_status")

  // Gateway-side record
  gatewayTxnId        String?   @map("gateway_txn_id")
  gatewayOrderId      String?   @map("gateway_order_id")
  gatewayAmount       Decimal?  @map("gateway_amount")
  gatewayStatus       String?   @map("gateway_status")
  gatewaySettledAt    DateTime? @map("gateway_settled_at")
  gatewayFee          Decimal?  @map("gateway_fee")         // MDR / platform fee
  gatewayTax          Decimal?  @map("gateway_tax")         // GST on gateway fee
  gatewaySettlement   Decimal?  @map("gateway_settlement")  // Net settled amount

  // Bank-side record
  bankRefNo           String?   @map("bank_ref_no")
  bankCreditDate      DateTime? @map("bank_credit_date")
  bankAmount          Decimal?  @map("bank_amount")

  // Reconciliation result
  matchStatus         String    @map("match_status")
  // Values: MATCHED, AMOUNT_MISMATCH, GATEWAY_ONLY, LOCAL_ONLY, BANK_PENDING
  discrepancyAmount   Decimal?  @map("discrepancy_amount")
  resolvedBy          String?   @map("resolved_by")
  resolvedAt          DateTime? @map("resolved_at")
  resolutionNote      String?   @map("resolution_note")

  createdAt           DateTime  @default(now()) @map("created_at")

  @@index([reconciliationDate])
  @@index([matchStatus])
  @@index([paymentId])
  @@map("payment_reconciliations")
}
```

### 5.3 Daily Reconciliation Service

```typescript
@Injectable()
export class ReconciliationService {
  // Scheduled to run daily at 6:00 AM IST
  @Cron('0 6 * * *', { timeZone: 'Asia/Kolkata' })
  async runDailyReconciliation() {
    const yesterday = startOfDay(subDays(new Date(), 1));
    const batchId = `RECON-${format(yesterday, 'yyyy-MM-dd')}`;

    this.logger.log(`Starting reconciliation for ${format(yesterday, 'dd-MMM-yyyy')}`);

    // ── Step 1: Fetch portal records for the day ──
    const localPayments = await this.prisma.payment.findMany({
      where: {
        paymentMethod: PaymentMethod.RAZORPAY,
        updatedAt: {
          gte: yesterday,
          lt: addDays(yesterday, 1),
        },
        status: { in: ['COMPLETED', 'FAILED'] },
      },
    });

    // ── Step 2: Fetch Razorpay settlements for the day ──
    // NOTE: Razorpay settlements API returns settled transactions, not
    // same-day payments. Use Razorpay Payments API for same-day matching.
    const rzpPayments = await this.razorpay.payments.all({
      from: Math.floor(yesterday.getTime() / 1000),
      to: Math.floor(addDays(yesterday, 1).getTime() / 1000),
      count: 100,
    });

    // ── Step 3: Build lookup maps ──
    const gatewayMap = new Map<string, any>();
    for (const rzpPay of rzpPayments.items) {
      gatewayMap.set(rzpPay.order_id, rzpPay);
    }

    // ── Step 4: Match records ──
    const reconRecords: any[] = [];

    for (const local of localPayments) {
      const gateway = gatewayMap.get(local.razorpayOrderId);

      if (!gateway) {
        reconRecords.push({
          batchId,
          reconciliationDate: yesterday,
          paymentId: local.id,
          ourOrderId: local.razorpayOrderId,
          ourAmount: local.totalAmount,
          ourStatus: local.status,
          matchStatus: 'GATEWAY_ONLY', // Exists locally, not found at gateway
        });
        continue;
      }

      const amountMatch = Math.abs(Number(local.totalAmount) - gateway.amount / 100) < 0.01;

      reconRecords.push({
        batchId,
        reconciliationDate: yesterday,
        paymentId: local.id,
        ourOrderId: local.razorpayOrderId,
        ourAmount: local.totalAmount,
        ourStatus: local.status,
        gatewayTxnId: gateway.id,
        gatewayOrderId: gateway.order_id,
        gatewayAmount: gateway.amount / 100,
        gatewayStatus: gateway.status,
        gatewayFee: (gateway.fee || 0) / 100,
        gatewayTax: (gateway.tax || 0) / 100,
        gatewaySettlement: (gateway.amount - (gateway.fee || 0) - (gateway.tax || 0)) / 100,
        matchStatus: amountMatch ? 'MATCHED' : 'AMOUNT_MISMATCH',
        discrepancyAmount: amountMatch
          ? 0
          : Math.abs(Number(local.totalAmount) - gateway.amount / 100),
      });

      gatewayMap.delete(local.razorpayOrderId);
    }

    // Records present at gateway but not in portal
    for (const [orderId, gateway] of gatewayMap) {
      reconRecords.push({
        batchId,
        reconciliationDate: yesterday,
        gatewayTxnId: gateway.id,
        gatewayOrderId: orderId,
        gatewayAmount: gateway.amount / 100,
        gatewayStatus: gateway.status,
        matchStatus: 'LOCAL_ONLY',
      });
    }

    // ── Step 5: Persist reconciliation records ──
    await this.prisma.paymentReconciliation.createMany({
      data: reconRecords,
    });

    // ── Step 6: Alert finance team on mismatches ──
    const mismatches = reconRecords.filter((r) => r.matchStatus !== 'MATCHED');
    if (mismatches.length > 0) {
      await this.notificationService.sendEmail({
        to: this.config.get('FINANCE_TEAM_EMAIL'),
        subject: `[APCD Portal] Reconciliation Alert -- ${format(yesterday, 'dd-MMM-yyyy')}`,
        body:
          `${mismatches.length} mismatch(es) found in batch ${batchId}. ` +
          `Please review at /admin/reconciliation.`,
      });
    }

    this.logger.log(
      `Reconciliation complete: ${reconRecords.length} records, ` +
        `${mismatches.length} mismatches`,
    );
  }
}
```

### 5.4 Settlement Delay Tracking

Razorpay settlements are typically T+2 business days. BillDesk is T+1 to T+3. The reconciliation service should account for this:

```typescript
// Expected settlement dates by gateway
const SETTLEMENT_BUSINESS_DAYS: Record<string, number> = {
  RAZORPAY: 2,
  BILLDESK: 3,
  SBI_EPAY: 2,
  NEFT: 0,  // Direct bank transfer, no gateway settlement
};

async flagDelayedSettlements() {
  const payments = await this.prisma.payment.findMany({
    where: {
      status: 'COMPLETED',
      paymentMethod: 'RAZORPAY',
      settlementConfirmed: false,
      verifiedAt: { lt: subBusinessDays(new Date(), 3) }, // 3 business days overdue
    },
  });

  for (const payment of payments) {
    await this.createAlert({
      type: 'SETTLEMENT_DELAYED',
      paymentId: payment.id,
      message: `Settlement overdue for order ${payment.razorpayOrderId}`,
    });
  }
}
```

### 5.5 Monthly Reconciliation Report

```typescript
async getMonthlyReconciliationSummary(month: number, year: number) {
  return this.prisma.paymentReconciliation.groupBy({
    by: ['matchStatus'],
    where: {
      reconciliationDate: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      },
    },
    _count: true,
    _sum: { ourAmount: true, gatewayAmount: true, discrepancyAmount: true },
  });
}
```

---

## 6. Refund Handling

### 6.1 Refund Scenarios

| Scenario                           | Trigger                     | Refund Amount                                   | Refund Channel           |
| ---------------------------------- | --------------------------- | ----------------------------------------------- | ------------------------ |
| Application rejected before review | Admin decision              | Full amount minus non-refundable processing fee | Gateway refund or NEFT   |
| Duplicate payment detected         | System or officer detection | Full duplicate amount                           | Gateway refund           |
| Overpayment via NEFT               | Manual verification         | Excess amount                                   | NEFT to applicant        |
| MSE discount refund                | Final Certificate issuance  | 15% of base fees (before GST)                   | NEFT to OEM bank account |
| Technical failure                  | Support ticket              | Full amount                                     | Gateway refund           |

### 6.2 Refund Database Model

```prisma
model PaymentRefund {
  id                  String    @id @default(uuid())
  paymentId           String    @map("payment_id")
  refundReason        String    @map("refund_reason")
  refundType          String    @map("refund_type")      // FULL, PARTIAL, MSE_DISCOUNT
  refundAmount        Decimal   @map("refund_amount")
  refundMethod        String    @map("refund_method")    // GATEWAY, NEFT, DEMAND_DRAFT

  // Gateway refund tracking
  gatewayRefundId     String?   @map("gateway_refund_id")   // Razorpay refund_xxxxx

  // Manual refund tracking (for NEFT)
  beneficiaryName     String?   @map("beneficiary_name")
  beneficiaryBank     String?   @map("beneficiary_bank")
  beneficiaryAccount  String?   @map("beneficiary_account")
  beneficiaryIFSC     String?   @map("beneficiary_ifsc")
  refundUTR           String?   @map("refund_utr")

  // Approval workflow
  status              String    @default("INITIATED")
  // Values: INITIATED, PENDING_APPROVAL, APPROVED, PROCESSED, FAILED, REJECTED
  initiatedById       String    @map("initiated_by_id")
  approvedById        String?   @map("approved_by_id")
  approvedAt          DateTime? @map("approved_at")
  processedAt         DateTime? @map("processed_at")
  rejectionReason     String?   @map("rejection_reason")

  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")

  @@index([paymentId])
  @@index([status])
  @@map("payment_refunds")
}
```

### 6.3 Refund Service Implementation

```typescript
@Injectable()
export class RefundService {
  // Threshold above which refunds require admin approval
  private readonly APPROVAL_THRESHOLD = 50000; // Rs 50,000

  async initiateRefund(params: {
    paymentId: string;
    reason: string;
    refundType: 'FULL' | 'PARTIAL' | 'MSE_DISCOUNT';
    partialAmount?: number;
    initiatedById: string;
  }) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: params.paymentId },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (!['COMPLETED', 'VERIFIED'].includes(payment.status)) {
      throw new BadRequestException('Payment not eligible for refund');
    }

    const refundAmount =
      params.refundType === 'FULL' ? Number(payment.totalAmount) : (params.partialAmount ?? 0);

    if (refundAmount <= 0) {
      throw new BadRequestException('Refund amount must be positive');
    }

    const refund = await this.prisma.paymentRefund.create({
      data: {
        paymentId: params.paymentId,
        refundReason: params.reason,
        refundType: params.refundType,
        refundAmount,
        refundMethod: payment.paymentMethod === 'RAZORPAY' ? 'GATEWAY' : 'NEFT',
        initiatedById: params.initiatedById,
        status: refundAmount > this.APPROVAL_THRESHOLD ? 'PENDING_APPROVAL' : 'APPROVED',
      },
    });

    // Auto-process if under threshold
    if (refundAmount <= this.APPROVAL_THRESHOLD) {
      return this.processRefund(refund.id, params.initiatedById);
    }

    // Alert admin for approval
    await this.notificationService.send({
      userId: await this.getAdminUserId(),
      type: 'GENERAL',
      title: 'Refund Approval Required',
      message: `Refund of Rs ${refundAmount} for payment ${params.paymentId} requires approval.`,
    });

    return refund;
  }

  async processRefund(refundId: string, approvedById: string) {
    const refund = await this.prisma.paymentRefund.findUnique({
      where: { id: refundId },
      include: { payment: true },
    });

    if (!refund) throw new NotFoundException('Refund not found');

    if (refund.refundMethod === 'GATEWAY' && refund.payment.razorpayPaymentId) {
      // Process through Razorpay Refund API
      const rzpRefund = await this.razorpay.payments.refund(refund.payment.razorpayPaymentId, {
        amount: Math.round(Number(refund.refundAmount) * 100), // paise
        speed: 'normal', // 'normal' = 5-7 days, 'optimum' = instant if eligible
        notes: {
          reason: refund.refundReason,
          refundId: refund.id,
        },
      });

      await this.prisma.paymentRefund.update({
        where: { id: refundId },
        data: {
          status: 'PROCESSED',
          gatewayRefundId: rzpRefund.id,
          approvedById,
          approvedAt: new Date(),
          processedAt: new Date(),
        },
      });
    } else {
      // NEFT refund -- mark as approved, finance team handles transfer
      await this.prisma.paymentRefund.update({
        where: { id: refundId },
        data: {
          status: 'APPROVED',
          approvedById,
          approvedAt: new Date(),
        },
      });
    }

    // Update original payment status
    await this.prisma.payment.update({
      where: { id: refund.paymentId },
      data: { status: PaymentStatus.REFUNDED },
    });

    return this.prisma.paymentRefund.findUnique({ where: { id: refundId } });
  }

  /**
   * MSE Discount Refund -- triggered when Final Certificate is issued.
   * The SOP specifies that eligible OEMs (MSE/Startup/Local Supplier)
   * pay the full amount upfront and receive a 15% refund of the base
   * fees (before GST) after empanelment is confirmed.
   */
  async processMSEDiscountRefund(applicationId: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        payments: { where: { status: { in: ['COMPLETED', 'VERIFIED'] } } },
        oemProfile: true,
      },
    });

    const isEligible =
      application?.oemProfile &&
      (application.oemProfile.isMSE ||
        application.oemProfile.isStartup ||
        application.oemProfile.isLocalSupplier);

    if (!isEligible) return null;

    const eligiblePayments = application!.payments.filter((p) =>
      ['APPLICATION_FEE', 'EMPANELMENT_FEE'].includes(p.paymentType),
    );

    const totalBase = eligiblePayments.reduce((sum, p) => sum + Number(p.baseAmount), 0);
    const refundAmount = Math.round(totalBase * 0.15); // 15% of base

    return this.prisma.paymentRefund.create({
      data: {
        paymentId: eligiblePayments[0].id,
        refundReason: 'MSE/Startup/Local Supplier 15% discount refund post-empanelment',
        refundType: 'MSE_DISCOUNT',
        refundAmount,
        refundMethod: 'NEFT',
        beneficiaryName: application!.oemProfile!.companyName,
        initiatedById: 'SYSTEM',
        status: 'PENDING_APPROVAL',
      },
    });
  }
}
```

---

## 7. Split Payments

### 7.1 Central/State Fee Distribution Model

In the broader CPCB/SPCB ecosystem, fees collected by a single portal often need to be distributed between central and state bodies. This is common in:

- Consent to Establish/Operate (CTE/CTO) fees -- primarily retained by the SPCB
- Environmental Clearance fees -- split between MoEFCC and SEIAA
- APCD Empanelment fees -- currently 100% to NPC (no split needed)

```typescript
// Split configuration
interface FeeSplitRule {
  feeType: string;
  centralSharePercent: number; // % to CPCB/NPC
  stateSharePercent: number; // % to SPCB
  centralBankAccount: BankAccount;
  stateAccountResolver: (stateCode: string) => BankAccount;
}

const SPLIT_RULES: Record<string, FeeSplitRule> = {
  CONSENT_FEE: {
    feeType: 'CONSENT_FEE',
    centralSharePercent: 10, // 10% to CPCB
    stateSharePercent: 90, // 90% to respective SPCB
    centralBankAccount: CPCB_BANK_ACCOUNT,
    stateAccountResolver: getStateBankAccount,
  },
  EMPANELMENT_FEE: {
    feeType: 'EMPANELMENT_FEE',
    centralSharePercent: 100, // 100% to NPC (no split)
    stateSharePercent: 0,
    centralBankAccount: NPC_BANK_ACCOUNT,
    stateAccountResolver: () => null,
  },
};
```

### 7.2 Split Payment Database Model

```prisma
model PaymentSplit {
  id                String    @id @default(uuid())
  paymentId         String    @map("payment_id")
  beneficiaryType   String    @map("beneficiary_type")   // CENTRAL, STATE
  beneficiaryCode   String    @map("beneficiary_code")   // 'CPCB', 'MPCB', 'KSPCB'
  sharePercent      Decimal   @map("share_percent")
  shareAmount       Decimal   @map("share_amount")
  settlementStatus  String    @default("PENDING") @map("settlement_status")
  // Values: PENDING, SETTLED, FAILED
  settledAt         DateTime? @map("settled_at")
  settlementRef     String?   @map("settlement_ref")     // UTR or transfer reference
  createdAt         DateTime  @default(now()) @map("created_at")

  @@index([paymentId])
  @@index([settlementStatus])
  @@map("payment_splits")
}
```

### 7.3 Implementation Approaches

**Approach 1: Razorpay Route (Linked Accounts)**

For online payments, Razorpay Route allows automatic splitting at the point of payment:

```typescript
const order = await razorpay.orders.create({
  amount: totalPaise,
  currency: 'INR',
  transfers: [
    {
      account: CPCB_RAZORPAY_LINKED_ACCOUNT_ID,
      amount: Math.round(totalPaise * 0.1), // 10% to CPCB
      currency: 'INR',
    },
    {
      account: SPCB_RAZORPAY_LINKED_ACCOUNT_ID,
      amount: Math.round(totalPaise * 0.9), // 90% to SPCB
      currency: 'INR',
    },
  ],
});
```

**Approach 2: Batch Settlement (for BillDesk/SBI ePay)**

When the gateway does not support native splitting, collect the full amount into a nodal account and run nightly batch settlements:

```typescript
@Cron('0 22 * * *') // 10 PM daily
async processSettlementBatch() {
  const unsettled = await this.prisma.paymentSplit.findMany({
    where: { settlementStatus: 'PENDING' },
    include: { payment: true },
  });

  // Group by beneficiary and sum amounts
  const grouped = groupBy(unsettled, 'beneficiaryCode');

  for (const [beneficiary, splits] of Object.entries(grouped)) {
    const totalAmount = splits.reduce((s, sp) => s + Number(sp.shareAmount), 0);
    const bankAccount = await this.getBankAccount(beneficiary);

    // Initiate NEFT transfer (via bank API or manual queue)
    const transferRef = await this.bankService.initiateTransfer({
      beneficiaryAccount: bankAccount.accountNumber,
      beneficiaryIFSC: bankAccount.ifscCode,
      amount: totalAmount,
      narration: `APCD Portal fee settlement - ${format(new Date(), 'dd-MMM-yyyy')}`,
    });

    // Mark splits as settled
    await this.prisma.paymentSplit.updateMany({
      where: { id: { in: splits.map(s => s.id) } },
      data: {
        settlementStatus: 'SETTLED',
        settledAt: new Date(),
        settlementRef: transferRef,
      },
    });
  }
}
```

---

## 8. Offline Payment

### 8.1 Supported Offline Methods

Current implementation (from `d:\APCD Portal\apcd-portal\packages\shared\src\types\payment.types.ts`):

```typescript
export enum PaymentMethod {
  RAZORPAY = 'RAZORPAY',
  NEFT = 'NEFT',
  RTGS = 'RTGS',
}
```

For broader government portal support, the following additional methods may be required:

| Method           | Description                             | Verification Mechanism      |
| ---------------- | --------------------------------------- | --------------------------- |
| NEFT             | National Electronic Funds Transfer      | UTR number + bank statement |
| RTGS             | Real Time Gross Settlement (>Rs 2 lakh) | UTR number + bank statement |
| Demand Draft     | Physical instrument payable to NPC      | DD number + bank clearance  |
| Treasury Challan | State treasury deposit                  | Challan number + GRN        |
| Cash (Counter)   | Walk-in payment at SPCB office          | Manual receipt              |

### 8.2 NEFT/RTGS Payment Flow (Current Implementation)

The complete NEFT flow is already implemented across the stack:

**Frontend** (`d:\APCD Portal\apcd-portal\apps\web\src\app\payments\checkout\[applicationId]\page.tsx`):

- Tab-based UI with "Online Payment" and "NEFT / RTGS" tabs
- Displays NPC bank details with copy-to-clipboard buttons
- Form fields: UTR number, payment date, remitter bank name
- Optional file upload for payment proof (bank receipt scan)

**Validation** (`d:\APCD Portal\apcd-portal\packages\shared\src\validators\payment.validator.ts`):

```typescript
export const submitManualPaymentSchema = z.object({
  applicationId: z.string().uuid(),
  paymentType: z.enum([...]),
  utrNumber: z.string().min(5, 'UTR/NEFT number is required'),
  remitterBankName: z.string().min(2, 'Remitter bank name is required'),
  neftAmount: z.number().positive('Amount must be positive'),
  neftDate: z.string().min(1, 'Payment date is required'),
  apcdTypeCount: z.number().int().min(1).default(1),
});
```

**Backend** (`d:\APCD Portal\apcd-portal\apps\api\src\modules\payments\payments.service.ts`):

- `recordManualPayment()` -- Creates Payment with status `VERIFICATION_PENDING`
- `verifyManualPayment()` -- Officer approves/rejects with remarks

**E2E Test Coverage** (`d:\APCD Portal\apcd-portal\e2e\payment-flow.spec.ts`):

- Test: NEFT form renders and accepts input
- Test: NEFT payment submission shows confirmation
- Test: Officer can access verification page
- Test: Officer can verify pending NEFT payment

### 8.3 Demand Draft Handling (Extended)

```typescript
interface DemandDraftPaymentDto {
  applicationId: string;
  paymentType: PaymentType;
  ddNumber: string;
  ddDate: string;                  // ISO date string
  ddAmount: number;
  issuingBankName: string;
  issuingBranchName: string;
  favourOf: string;                // 'National Productivity Council'
  payableAt: string;               // 'New Delhi'
}

async recordDemandDraft(userId: string, dto: DemandDraftPaymentDto) {
  await this.validateApplicationForPayment(dto.applicationId, userId);

  return this.prisma.payment.create({
    data: {
      applicationId: dto.applicationId,
      paymentType: dto.paymentType,
      paymentMethod: 'DEMAND_DRAFT',
      status: PaymentStatus.VERIFICATION_PENDING,
      baseAmount: dto.ddAmount,
      gstRate: 18,
      gstAmount: Math.round(dto.ddAmount * 0.18),
      totalAmount: Math.round(dto.ddAmount * 1.18),
      // DD-specific fields stored in a JSON column or dedicated columns
      metadata: {
        ddNumber: dto.ddNumber,
        ddDate: dto.ddDate,
        issuingBank: dto.issuingBankName,
        issuingBranch: dto.issuingBranchName,
        favourOf: dto.favourOf,
        payableAt: dto.payableAt,
      },
    },
  });
}
```

### 8.4 Manual Verification Workflow (Officer/Dealing Hand)

Source: `d:\APCD Portal\apcd-portal\apps\api\src\modules\payments\payments.service.ts`, lines 235-274.

```
  OEM submits NEFT/DD details
       |
       v
  Payment created (VERIFICATION_PENDING)
       |
       v
  Officer sees in GET /payments/pending-verification
  (sorted by createdAt ascending -- oldest first)
       |
       v
  Officer cross-checks:
    1. UTR/DD number exists in bank statement
    2. Amount matches calculated fee
    3. Credit/clearance date is within acceptable range
    4. Remitter name/bank is plausible
       |
       +----> PUT /payments/:id/verify { isVerified: true, remarks: "..." }
       |          --> Status: VERIFIED
       |          --> Trigger: Application moves to UNDER_REVIEW
       |
       +----> PUT /payments/:id/verify { isVerified: false, remarks: "UTR not found" }
                  --> Status: FAILED
                  --> OEM notified to resubmit with correct details
```

Roles authorized for manual payment verification (from `d:\APCD Portal\apcd-portal\apps\api\src\modules\payments\payments.controller.ts`, line 89):

```typescript
@Put(':id/verify')
@Roles(Role.OFFICER, Role.ADMIN)
```

The LLD also lists `DEALING_HAND` as authorized for payment verification.

---

## 9. GST Integration

### 9.1 GST on Government Fees

NPC is registered under GST (GSTIN: `07AAATN0402F1Z8`, PAN: `AAATN0402F`, State Code: `07` -- Delhi). All fees collected by NPC attract 18% GST.

**CGST/SGST vs IGST determination**:

```typescript
function determineGSTComponents(params: {
  supplierStateCode: string; // NPC: '07' (Delhi)
  recipientStateCode: string; // OEM's state from profile
  totalGSTAmount: number;
}): { cgst: number; sgst: number; igst: number } {
  const isInterState = params.supplierStateCode !== params.recipientStateCode;

  if (isInterState) {
    // Inter-state supply: 18% IGST
    return { cgst: 0, sgst: 0, igst: params.totalGSTAmount };
  }

  // Intra-state supply (OEM also in Delhi): 9% CGST + 9% SGST
  return {
    cgst: Math.round(params.totalGSTAmount / 2),
    sgst: Math.round(params.totalGSTAmount / 2),
    igst: 0,
  };
}
```

### 9.2 SAC Codes for Environmental Services

| Service            | SAC Code | Description                                         |
| ------------------ | -------- | --------------------------------------------------- |
| Application Fee    | 998599   | Other professional, technical and business services |
| Empanelment Fee    | 998599   | Other professional, technical and business services |
| Field Verification | 998397   | Technical testing and analysis services             |
| Emission Testing   | 998397   | Technical testing and analysis services             |
| Annual Renewal     | 998599   | Other professional, technical and business services |
| Consent Fee (SPCB) | 999792   | Environmental protection services                   |
| NOC Fee (SPCB)     | 999792   | Environmental protection services                   |

### 9.3 GST Invoice Structure

```typescript
interface GSTInvoice {
  // Invoice identification
  invoiceNumber: string; // NPC/2025-26/INV/000042
  invoiceDate: Date;

  // Supplier (NPC)
  supplierName: string; // 'National Productivity Council'
  supplierGSTIN: string; // '07AAATN0402F1Z8'
  supplierAddress: string; // 'Utpadakta Bhavan, Lodhi Road, New Delhi - 110003'
  supplierStateCode: string; // '07'

  // Recipient (OEM)
  recipientName: string;
  recipientGSTIN: string;
  recipientAddress: string;
  recipientStateCode: string;

  // Line items
  items: Array<{
    description: string;
    sacCode: string;
    quantity: number;
    unitRate: number;
    taxableAmount: number;
    cgstRate: number;
    cgstAmount: number;
    sgstRate: number;
    sgstAmount: number;
    igstRate: number;
    igstAmount: number;
    totalAmount: number;
  }>;

  // Totals
  totalTaxableAmount: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  grandTotal: number;
  amountInWords: string;

  // Linked payment
  paymentId: string;
  transactionId: string;
}
```

### 9.4 GSTR-1 Data Export

For NPC's monthly GST filing:

```typescript
async exportGSTR1Data(month: number, year: number) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = endOfMonth(startDate);

  const payments = await this.prisma.payment.findMany({
    where: {
      status: { in: ['COMPLETED', 'VERIFIED'] },
      verifiedAt: { gte: startDate, lte: endDate },
    },
    include: {
      application: {
        include: { oemProfile: true },
      },
    },
  });

  // B2B invoices: to registered recipients (with GSTIN)
  const b2b = payments
    .filter(p => p.application.oemProfile?.gstRegistrationNo)
    .map(p => ({
      recipientGSTIN: p.application.oemProfile!.gstRegistrationNo,
      invoiceNumber: `NPC/${this.getFY(p.verifiedAt!)}/INV/${p.id.slice(0, 8)}`,
      invoiceDate: format(p.verifiedAt!, 'dd-MMM-yyyy'),
      invoiceValue: Number(p.totalAmount),
      placeOfSupply: p.application.oemProfile!.state,
      reverseCharge: 'N',
      invoiceType: 'Regular',
      taxableValue: Number(p.baseAmount) - Number(p.discountAmount),
      cgstRate: 9,
      cgstAmount: Number(p.gstAmount) / 2,
      sgstRate: 9,
      sgstAmount: Number(p.gstAmount) / 2,
      igstRate: 0,
      igstAmount: 0,
    }));

  return {
    period: `${String(month).padStart(2, '0')}/${year}`,
    b2bInvoices: b2b,
    totalInvoices: b2b.length,
    totalTaxableValue: b2b.reduce((s, i) => s + i.taxableValue, 0),
    totalGST: b2b.reduce((s, i) => s + i.cgstAmount + i.sgstAmount, 0),
  };
}
```

---

## 10. Database Schema

### 10.1 Existing Payment Tables

The following models are already implemented in `d:\APCD Portal\apcd-portal\packages\database\prisma\schema.prisma`:

**Payment** (lines 674-719):

```prisma
model Payment {
  id                String        @id @default(uuid())
  applicationId     String        @map("application_id")
  paymentType       PaymentType   @map("payment_type")
  paymentMethod     PaymentMethod @map("payment_method")
  status            PaymentStatus @default(PENDING)

  // Amounts
  baseAmount        Decimal       @map("base_amount")
  gstRate           Decimal       @default(18) @map("gst_rate")
  gstAmount         Decimal       @map("gst_amount")
  discountPercent   Decimal       @default(0) @map("discount_percent")
  discountAmount    Decimal       @default(0) @map("discount_amount")
  totalAmount       Decimal       @map("total_amount")

  // Razorpay fields
  razorpayOrderId   String?       @map("razorpay_order_id")
  razorpayPaymentId String?       @map("razorpay_payment_id")
  razorpaySignature String?       @map("razorpay_signature")

  // Manual NEFT/RTGS fields
  utrNumber         String?       @map("utr_number")
  remitterBankName  String?       @map("remitter_bank_name")
  neftAmount        Decimal?      @map("neft_amount")
  neftDate          DateTime?     @map("neft_date")
  neftProofPath     String?       @map("neft_proof_path")

  // Verification
  verifiedById      String?       @map("verified_by_id")
  verifiedAt        DateTime?     @map("verified_at")
  verificationNote  String?       @map("verification_note")

  // APCD type count
  apcdTypeCount     Int           @default(1) @map("apcd_type_count")

  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")

  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  verifiedBy  User?       @relation("PaymentVerifiedBy", fields: [verifiedById], references: [id])

  @@index([applicationId])
  @@index([status])
  @@index([razorpayOrderId])
  @@map("payments")
}
```

**FeeConfiguration** (lines 806-817):

```prisma
model FeeConfiguration {
  id              String      @id @default(uuid())
  paymentType     PaymentType @map("payment_type") @unique
  baseAmount      Decimal     @map("base_amount")
  gstRate         Decimal     @default(18) @map("gst_rate")
  discountPercent Decimal     @default(15) @map("discount_percent")
  description     String?
  isActive        Boolean     @default(true) @map("is_active")
  updatedAt       DateTime    @updatedAt @map("updated_at")
  @@map("fee_configurations")
}
```

**Supporting Enums**:

```prisma
enum PaymentType {
  APPLICATION_FEE
  EMPANELMENT_FEE
  FIELD_VERIFICATION
  EMISSION_TESTING
  ANNUAL_RENEWAL
  SURVEILLANCE_VISIT
}

enum PaymentStatus {
  PENDING
  INITIATED
  COMPLETED
  FAILED
  REFUNDED
  VERIFICATION_PENDING
  VERIFIED
}

enum PaymentMethod {
  RAZORPAY
  NEFT
  RTGS
}
```

### 10.2 Recommended Additional Tables

The following tables complete the payment subsystem for a production government portal:

```prisma
// ── Payment Receipt ─────────────────────────────────────────────────
model PaymentReceipt {
  id              String    @id @default(uuid())
  paymentId       String    @unique @map("payment_id")
  receiptNumber   String    @unique @map("receipt_number")   // NPC/2025-26/PAY/000042
  financialYear   String    @map("financial_year")           // '2025-26'
  receiptDate     DateTime  @map("receipt_date")

  // GST invoice fields
  invoiceNumber   String?   @unique @map("invoice_number")   // NPC/2025-26/INV/000042
  sacCode         String?   @map("sac_code")                 // '998599'
  cgstAmount      Decimal?  @map("cgst_amount")
  sgstAmount      Decimal?  @map("sgst_amount")
  igstAmount      Decimal?  @map("igst_amount")
  placeOfSupply   String?   @map("place_of_supply")          // State code

  // Generated files
  receiptPdfPath  String?   @map("receipt_pdf_path")         // MinIO path
  qrCodeData      String?   @map("qr_code_data")

  // Digital signature
  digitalSignHash String?   @map("digital_sign_hash")
  signedBy        String?   @map("signed_by")
  signedAt        DateTime? @map("signed_at")

  createdAt       DateTime  @default(now()) @map("created_at")

  payment Payment @relation(fields: [paymentId], references: [id])

  @@index([receiptNumber])
  @@index([financialYear])
  @@map("payment_receipts")
}

// ── Payment Refund ──────────────────────────────────────────────────
model PaymentRefund {
  id                  String    @id @default(uuid())
  paymentId           String    @map("payment_id")
  refundReason        String    @map("refund_reason")
  refundType          String    @map("refund_type")          // FULL, PARTIAL, MSE_DISCOUNT
  refundAmount        Decimal   @map("refund_amount")
  refundMethod        String    @map("refund_method")        // GATEWAY, NEFT, DD

  gatewayRefundId     String?   @map("gateway_refund_id")
  beneficiaryName     String?   @map("beneficiary_name")
  beneficiaryAccount  String?   @map("beneficiary_account")
  beneficiaryIFSC     String?   @map("beneficiary_ifsc")
  refundUTR           String?   @map("refund_utr")

  status              String    @default("INITIATED")
  initiatedById       String    @map("initiated_by_id")
  approvedById        String?   @map("approved_by_id")
  approvedAt          DateTime? @map("approved_at")
  processedAt         DateTime? @map("processed_at")
  rejectionReason     String?   @map("rejection_reason")

  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")

  @@index([paymentId])
  @@index([status])
  @@map("payment_refunds")
}

// ── Payment Reconciliation ──────────────────────────────────────────
model PaymentReconciliation {
  id                  String    @id @default(uuid())
  reconciliationDate  DateTime  @map("reconciliation_date")
  batchId             String    @map("batch_id")

  paymentId           String?   @map("payment_id")
  ourOrderId          String?   @map("our_order_id")
  ourAmount           Decimal?  @map("our_amount")
  ourStatus           String?   @map("our_status")

  gatewayTxnId        String?   @map("gateway_txn_id")
  gatewayOrderId      String?   @map("gateway_order_id")
  gatewayAmount       Decimal?  @map("gateway_amount")
  gatewayStatus       String?   @map("gateway_status")
  gatewaySettledAt    DateTime? @map("gateway_settled_at")
  gatewayFee          Decimal?  @map("gateway_fee")
  gatewayTax          Decimal?  @map("gateway_tax")
  gatewaySettlement   Decimal?  @map("gateway_settlement")

  bankRefNo           String?   @map("bank_ref_no")
  bankCreditDate      DateTime? @map("bank_credit_date")
  bankAmount          Decimal?  @map("bank_amount")

  matchStatus         String    @map("match_status")
  discrepancyAmount   Decimal?  @map("discrepancy_amount")
  resolvedBy          String?   @map("resolved_by")
  resolvedAt          DateTime? @map("resolved_at")
  resolutionNote      String?   @map("resolution_note")

  createdAt           DateTime  @default(now()) @map("created_at")

  @@index([reconciliationDate])
  @@index([matchStatus])
  @@index([paymentId])
  @@map("payment_reconciliations")
}

// ── Payment Split (for multi-body fee distribution) ─────────────────
model PaymentSplit {
  id                String    @id @default(uuid())
  paymentId         String    @map("payment_id")
  beneficiaryType   String    @map("beneficiary_type")   // CENTRAL, STATE
  beneficiaryCode   String    @map("beneficiary_code")   // CPCB, MPCB, KSPCB
  sharePercent      Decimal   @map("share_percent")
  shareAmount       Decimal   @map("share_amount")
  settlementStatus  String    @default("PENDING") @map("settlement_status")
  settledAt         DateTime? @map("settled_at")
  settlementRef     String?   @map("settlement_ref")
  createdAt         DateTime  @default(now()) @map("created_at")

  @@index([paymentId])
  @@index([settlementStatus])
  @@map("payment_splits")
}

// ── Fee Schedule (for SPCB slab-based fees) ─────────────────────────
model FeeSchedule {
  id                String    @id @default(uuid())
  stateCode         String    @map("state_code")
  feeCategory       String    @map("fee_category")
  industryCategory  String    @map("industry_category")
  industryScale     String    @map("industry_scale")
  slabMinCapital    Decimal?  @map("slab_min_capital")
  slabMaxCapital    Decimal?  @map("slab_max_capital")
  baseFee           Decimal   @map("base_fee")
  perLakhRate       Decimal?  @map("per_lakh_rate")
  gstRate           Decimal   @default(18) @map("gst_rate")
  effectiveFrom     DateTime  @map("effective_from")
  effectiveTo       DateTime? @map("effective_to")
  isActive          Boolean   @default(true) @map("is_active")
  createdAt         DateTime  @default(now()) @map("created_at")

  @@unique([stateCode, feeCategory, industryCategory, industryScale, effectiveFrom])
  @@map("fee_schedules")
}
```

### 10.3 Entity Relationship Summary

```
                              Application
                                  |
                           1 ────< N
                                  |
                              Payment ──────< PaymentReceipt  (1:1)
                                  |
                           1 ────< N ────< N ────< N
                                  |        |        |
                          PaymentRefund  PaymentSplit  PaymentReconciliation

  FeeConfiguration (1 per PaymentType, lookup table)
  FeeSchedule (N rows per state+category+scale, for SPCB portals)

  User ──< Payment       (verifiedBy)
  User ──< PaymentRefund (initiatedBy, approvedBy)
```

---

## 11. Security

### 11.1 PCI-DSS Compliance Position

The APCD Portal uses **Razorpay Standard Checkout** (hosted payment page). This means:

| What                    | Stored? | Where                               |
| ----------------------- | ------- | ----------------------------------- |
| Card numbers            | NEVER   | Handled entirely by Razorpay iframe |
| CVV / CVC               | NEVER   | Handled entirely by Razorpay iframe |
| Card expiry             | NEVER   | Handled entirely by Razorpay iframe |
| UPI PIN                 | NEVER   | Handled by UPI PSP app              |
| Net banking credentials | NEVER   | Handled by bank website             |
| Razorpay order_id       | YES     | `payments.razorpay_order_id`        |
| Razorpay payment_id     | YES     | `payments.razorpay_payment_id`      |
| HMAC signature          | YES     | `payments.razorpay_signature`       |
| UTR numbers (NEFT)      | YES     | `payments.utr_number`               |
| Payment amounts         | YES     | `payments.total_amount`             |

**PCI-DSS SAQ type**: SAQ-A (no card data touches our servers).

### 11.2 Payment Data Encryption at Rest

Sensitive fields (UTR numbers, bank account details for refunds) should be encrypted at the application layer:

```typescript
import * as crypto from 'crypto';

@Injectable()
class PaymentEncryptionService {
  private algorithm = 'aes-256-gcm' as const;
  private key: Buffer;

  constructor(config: ConfigService) {
    // 256-bit key stored in environment variable (hex-encoded)
    this.key = Buffer.from(config.get('PAYMENT_ENCRYPTION_KEY'), 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    // Format: IV:AuthTag:CipherText (all hex-encoded)
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  decrypt(ciphertext: string): string {
    const [ivHex, tagHex, encrypted] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
```

### 11.3 Double-Payment Prevention

Three layers of defense:

**Layer 1: Application-level check** (before order creation):

```typescript
// Check for existing non-failed payment of the same type
const existing = await this.prisma.payment.findFirst({
  where: {
    applicationId: dto.applicationId,
    paymentType: dto.paymentType,
    status: { in: ['INITIATED', 'COMPLETED', 'VERIFIED'] },
  },
});
if (existing?.status === 'COMPLETED' || existing?.status === 'VERIFIED') {
  throw new BadRequestException('Payment already completed for this fee type');
}
```

**Layer 2: Gateway-level deduplication** (Razorpay `receipt` parameter):

```typescript
const order = await razorpay.orders.create({
  amount: totalPaise,
  currency: 'INR',
  receipt: `${applicationId}_${paymentType}`, // unique per fee per application
});
```

**Layer 3: Database constraint** (recommended):

```sql
-- Partial unique index: only one COMPLETED/VERIFIED payment per type per application
CREATE UNIQUE INDEX idx_payment_unique_completed
ON payments (application_id, payment_type)
WHERE status IN ('COMPLETED', 'VERIFIED');
```

### 11.4 Webhook Security

For asynchronous payment status updates (recommended addition to current implementation):

```typescript
@Post('razorpay/webhook')
async handleRazorpayWebhook(@Req() req: Request) {
  const receivedSignature = req.headers['x-razorpay-signature'] as string;
  const webhookSecret = this.config.get('RAZORPAY_WEBHOOK_SECRET');

  // Verify webhook signature
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (receivedSignature !== expectedSignature) {
    throw new UnauthorizedException('Invalid webhook signature');
  }

  const event = req.body;
  switch (event.event) {
    case 'payment.captured':
      await this.handlePaymentCaptured(event.payload.payment.entity);
      break;
    case 'payment.failed':
      await this.handlePaymentFailed(event.payload.payment.entity);
      break;
    case 'refund.processed':
      await this.handleRefundProcessed(event.payload.refund.entity);
      break;
  }

  return { status: 'ok' };
}
```

### 11.5 Rate Limiting on Payment Endpoints

```typescript
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 5, ttl: 60000 } })   // 5 per minute
@Post('razorpay/create-order')
async createOrder() { /* ... */ }

@Throttle({ default: { limit: 10, ttl: 60000 } })  // 10 per minute
@Post('razorpay/verify')
async verify() { /* ... */ }

@Throttle({ default: { limit: 3, ttl: 60000 } })   // 3 per minute
@Post('manual')
async recordManual() { /* ... */ }
```

### 11.6 Audit Logging

All payment operations are logged via the existing `AuditLog` model (schema lines 757-776):

```typescript
// Audit log entries created for every payment state change
await this.prisma.auditLog.create({
  data: {
    userId: officerId,
    action: 'PAYMENT_VERIFIED',
    entityType: 'Payment',
    entityId: paymentId,
    oldValues: { status: 'VERIFICATION_PENDING' },
    newValues: { status: 'VERIFIED', verifiedById: officerId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  },
});
```

---

## 12. Reporting

### 12.1 Report Catalog

| Report                          | Frequency              | Audience                | Data Source                                            |
| ------------------------------- | ---------------------- | ----------------------- | ------------------------------------------------------ |
| Daily Collection Summary        | Daily (auto-generated) | Finance Officer, Admin  | payments table                                         |
| Payment Status Report           | Daily                  | Admin, Officer          | payments table                                         |
| Pending Payment Dashboard       | Real-time              | Officers, Dealing Hands | payments table                                         |
| Gateway Reconciliation Report   | Daily                  | Finance Team            | payment_reconciliations                                |
| Monthly Revenue Report          | Monthly                | Management, CPCB        | payments + oem_profiles                                |
| GST Filing Report (GSTR-1)      | Monthly                | Accounts Team           | payments + oem_profiles                                |
| Fee-wise Collection Report      | Monthly                | Admin                   | payments grouped by type                               |
| State-wise Collection Report    | Monthly                | CPCB Management         | payments + oem_profiles.state                          |
| Refund Tracker                  | Weekly                 | Finance Team            | payment_refunds                                        |
| Outstanding Dues Report         | Weekly                 | Admin                   | applications without paid status                       |
| Reconciliation Exception Report | As needed              | Finance Team            | payment_reconciliations WHERE matchStatus != 'MATCHED' |

### 12.2 Existing Payment Statistics Endpoint

Source: `d:\APCD Portal\apcd-portal\apps\api\src\modules\payments\payments.service.ts`, lines 346-373.

```typescript
// GET /payments/stats (OFFICER, ADMIN)
async getPaymentStats() {
  const [total, verified, pending, failed] = await Promise.all([
    this.prisma.payment.aggregate({
      _sum: { totalAmount: true },
      _count: true,
    }),
    this.prisma.payment.aggregate({
      where: { status: PaymentStatus.VERIFIED },
      _sum: { totalAmount: true },
      _count: true,
    }),
    this.prisma.payment.count({
      where: { status: PaymentStatus.VERIFICATION_PENDING },
    }),
    this.prisma.payment.count({
      where: { status: PaymentStatus.FAILED },
    }),
  ]);

  return {
    totalPayments: total._count,
    totalAmount: total._sum.totalAmount || 0,
    verifiedPayments: verified._count,
    verifiedAmount: verified._sum.totalAmount || 0,
    pendingVerification: pending,
    failedPayments: failed,
  };
}
```

### 12.3 Extended Report Queries

**Daily Collection Summary**:

```typescript
async getDailyCollectionSummary(date: Date) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const collections = await this.prisma.payment.groupBy({
    by: ['paymentType', 'paymentMethod'],
    where: {
      status: { in: ['COMPLETED', 'VERIFIED'] },
      verifiedAt: { gte: dayStart, lte: dayEnd },
    },
    _sum: { totalAmount: true, baseAmount: true, gstAmount: true },
    _count: true,
  });

  const grandTotal = collections.reduce(
    (sum, c) => sum + Number(c._sum.totalAmount || 0), 0,
  );
  const totalGST = collections.reduce(
    (sum, c) => sum + Number(c._sum.gstAmount || 0), 0,
  );
  const txnCount = collections.reduce(
    (sum, c) => sum + c._count, 0,
  );

  return {
    date: format(date, 'dd-MMM-yyyy'),
    collections,
    grandTotal,
    totalGST,
    transactionCount: txnCount,
  };
}
```

**Monthly Revenue Report**:

```typescript
async getMonthlyRevenue(month: number, year: number) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = endOfMonth(monthStart);

  return this.prisma.$queryRaw`
    SELECT
      DATE(verified_at) as collection_date,
      payment_type,
      payment_method,
      COUNT(*)::int as transaction_count,
      SUM(base_amount)::numeric as total_base,
      SUM(gst_amount)::numeric as total_gst,
      SUM(total_amount)::numeric as total_collected,
      SUM(discount_amount)::numeric as total_discounts
    FROM payments
    WHERE status IN ('COMPLETED', 'VERIFIED')
      AND verified_at >= ${monthStart}
      AND verified_at <= ${monthEnd}
    GROUP BY DATE(verified_at), payment_type, payment_method
    ORDER BY collection_date, payment_type
  `;
}
```

**Pending Payment Dashboard** (real-time):

```typescript
async getPendingPaymentDashboard() {
  const [pendingVerification, abandonedCheckouts, unpaidApplications] =
    await Promise.all([
      // Payments awaiting officer verification
      this.prisma.payment.findMany({
        where: { status: 'VERIFICATION_PENDING' },
        include: {
          application: {
            select: {
              applicationNumber: true,
              oemProfile: { select: { companyName: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),

      // Initiated but abandoned (>1 hour old)
      this.prisma.payment.findMany({
        where: {
          status: 'INITIATED',
          createdAt: { lt: subHours(new Date(), 1) },
        },
        include: {
          application: {
            select: {
              applicationNumber: true,
              applicant: { select: { email: true } },
            },
          },
        },
      }),

      // Submitted applications with no payment
      this.prisma.application.findMany({
        where: {
          status: 'SUBMITTED',
          payments: { none: {} },
        },
        select: {
          id: true,
          applicationNumber: true,
          submittedAt: true,
          oemProfile: { select: { companyName: true } },
        },
      }),
    ]);

  return {
    pendingVerification: {
      count: pendingVerification.length,
      totalAmount: pendingVerification.reduce(
        (s, p) => s + Number(p.totalAmount), 0,
      ),
      items: pendingVerification,
    },
    abandonedCheckouts: {
      count: abandonedCheckouts.length,
      items: abandonedCheckouts,
    },
    unpaidApplications: {
      count: unpaidApplications.length,
      items: unpaidApplications,
    },
  };
}
```

**State-wise Collection Report** (for CPCB):

```typescript
async getStateWiseCollection(financialYear: string) {
  // Parse FY: '2025-26' -> April 2025 to March 2026
  const fyStart = parseInt(financialYear.split('-')[0]);
  const startDate = new Date(fyStart, 3, 1);  // April 1
  const endDate = new Date(fyStart + 1, 2, 31); // March 31

  return this.prisma.$queryRaw`
    SELECT
      op.state,
      COUNT(DISTINCT p.application_id)::int as application_count,
      COUNT(p.id)::int as payment_count,
      SUM(p.total_amount)::numeric as total_collected,
      SUM(p.gst_amount)::numeric as total_gst,
      SUM(CASE WHEN p.payment_method = 'RAZORPAY'
        THEN p.total_amount ELSE 0 END)::numeric as online_collected,
      SUM(CASE WHEN p.payment_method IN ('NEFT', 'RTGS')
        THEN p.total_amount ELSE 0 END)::numeric as offline_collected
    FROM payments p
    JOIN applications a ON p.application_id = a.id
    JOIN oem_profiles op ON a.oem_profile_id = op.id
    WHERE p.status IN ('COMPLETED', 'VERIFIED')
      AND p.verified_at >= ${startDate}
      AND p.verified_at <= ${endDate}
    GROUP BY op.state
    ORDER BY total_collected DESC
  `;
}
```

### 12.4 Export Formats

Government finance reports are typically exported in three formats:

```typescript
@Get('reports/daily-collection')
@Roles(Role.ADMIN, Role.OFFICER)
async exportDailyCollection(
  @Query('date') date: string,
  @Query('format') format: 'json' | 'xlsx' | 'pdf' | 'csv' = 'json',
  @Res() res: Response,
) {
  const data = await this.service.getDailyCollectionSummary(new Date(date));

  switch (format) {
    case 'xlsx': {
      // Excel -- preferred by finance teams
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Daily Collection');
      sheet.columns = [
        { header: 'Fee Type', key: 'paymentType', width: 25 },
        { header: 'Method', key: 'paymentMethod', width: 15 },
        { header: 'Count', key: 'count', width: 10 },
        { header: 'Base Amount', key: 'baseAmount', width: 18 },
        { header: 'GST', key: 'gstAmount', width: 15 },
        { header: 'Total', key: 'totalAmount', width: 18 },
      ];
      // ... populate rows from data.collections
      res.setHeader('Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition',
        `attachment; filename=collection_${date}.xlsx`);
      await workbook.xlsx.write(res);
      return;
    }
    case 'pdf': {
      // PDF -- for signed/archived reports
      const pdf = await this.pdfService.generateCollectionReport(data);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition',
        `attachment; filename=collection_${date}.pdf`);
      res.send(pdf);
      return;
    }
    case 'csv': {
      // CSV -- for bank reconciliation / PFMS upload
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition',
        `attachment; filename=collection_${date}.csv`);
      // ... stream CSV rows
      return;
    }
    default:
      return res.json(data);
  }
}
```

---

## Appendix A: File Reference Map

| File Path                                                     | Purpose                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/types/payment.types.ts`                  | PaymentType, PaymentStatus, PaymentMethod enums; NPC bank details constant                                                                        |
| `packages/shared/src/constants/fee-structure.ts`              | FEE_AMOUNTS, GST_RATE, DISCOUNT_PERCENT; calculateFee() and calculateApplicationTotalFees()                                                       |
| `packages/shared/src/validators/payment.validator.ts`         | Zod schemas: initiateRazorpayPaymentSchema, verifyRazorpayPaymentSchema, submitManualPaymentSchema, verifyManualPaymentSchema                     |
| `packages/database/prisma/schema.prisma`                      | Payment model (lines 674-719), FeeConfiguration model (lines 806-817), PaymentType/Status/Method enums                                            |
| `apps/api/src/modules/payments/payments.service.ts`           | Core payment business logic: calculateFees, createRazorpayOrder, verifyRazorpayPayment, recordManualPayment, verifyManualPayment, getPaymentStats |
| `apps/api/src/modules/payments/payments.controller.ts`        | REST endpoints: 8 routes covering calculate, create, verify, manual, pending-verification, stats                                                  |
| `apps/api/src/modules/payments/payments.module.ts`            | NestJS module wiring                                                                                                                              |
| `apps/web/src/app/payments/checkout/[applicationId]/page.tsx` | Frontend checkout page: Razorpay modal integration, NEFT form, fee breakdown display                                                              |
| `e2e/payment-flow.spec.ts`                                    | Playwright E2E tests: OEM payment page, checkout, NEFT submission, officer verification                                                           |
| `docs/HLD.md`                                                 | Section 7 (Payments Module overview)                                                                                                              |
| `docs/LLD.md`                                                 | PaymentsService function signatures, fee calculation business rules                                                                               |

## Appendix B: Environment Variables

| Variable                   | Purpose                                                 | Required                  |
| -------------------------- | ------------------------------------------------------- | ------------------------- |
| `RAZORPAY_KEY_ID`          | Public key for Razorpay checkout                        | Yes (for online payments) |
| `RAZORPAY_KEY_SECRET`      | Secret key for HMAC verification                        | Yes (for online payments) |
| `RAZORPAY_WEBHOOK_SECRET`  | Secret for webhook signature verification               | Recommended               |
| `NEXT_PUBLIC_RAZORPAY_KEY` | Public key exposed to Next.js frontend                  | Yes                       |
| `PAYMENT_ENCRYPTION_KEY`   | AES-256 key for encrypting sensitive payment data (hex) | Recommended               |
| `DSC_P12_PATH`             | Path to PKCS#12 Digital Signature Certificate file      | For receipt signing       |
| `DSC_PASSWORD`             | Password for the DSC .p12 file                          | For receipt signing       |
| `FINANCE_TEAM_EMAIL`       | Email for reconciliation alerts                         | Recommended               |
