'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CreditCard,
  Building2,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  Copy,
  IndianRupee,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { apiGet, apiPost, uploadFile, getApiErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

declare global {
  interface Window {
    Razorpay: any;
  }
}

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

export default function PaymentCheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const applicationId = params.applicationId as string;

  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'neft'>('razorpay');
  const [neftForm, setNeftForm] = useState({
    utrNumber: '',
    neftDate: '',
    remitterBankName: '',
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);

  // Fetch fee calculation
  const { data: feeResponse, isLoading: feesLoading } = useQuery({
    queryKey: ['payment-calculate', applicationId],
    queryFn: () => apiGet<any>(`/payments/calculate/${applicationId}`),
  });
  const fees = feeResponse?.data || feeResponse;

  // Fetch bank details for NEFT
  const { data: bankResponse } = useQuery({
    queryKey: ['bank-details'],
    queryFn: () => apiGet<any>('/payments/bank-details'),
    enabled: paymentMethod === 'neft',
  });
  const bankDetails = bankResponse?.data || bankResponse;

  // Razorpay create order mutation
  const createOrderMutation = useMutation({
    mutationFn: (data: any) => apiPost<any>('/payments/razorpay/create-order', data),
  });

  // Razorpay verify mutation
  const verifyMutation = useMutation({
    mutationFn: (data: any) => apiPost('/payments/razorpay/verify', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-calculate', applicationId] });
      toast({ title: 'Payment successful!' });
      router.push('/applications');
    },
    onError: (error: unknown) => {
      toast({
        title: 'Payment Verification Failed',
        description: getApiErrorMessage(
          error,
          'Payment verification failed. Please contact support.',
        ),
        variant: 'destructive',
      });
    },
  });

  // Manual payment mutation
  const manualPaymentMutation = useMutation({
    mutationFn: (data: any) => apiPost('/payments/manual', data),
    onSuccess: async (result: any) => {
      // Upload proof if available
      if (proofFile && result?.data?.id) {
        try {
          await uploadFile(`/attachments/${applicationId}/upload`, proofFile, undefined, {
            documentType: 'PAYMENT_PROOF',
          });
        } catch {
          // Non-critical
        }
      }
      queryClient.invalidateQueries({ queryKey: ['payment-calculate', applicationId] });
      toast({ title: 'Payment recorded. Pending officer verification.' });
      router.push('/applications');
    },
    onError: (error: unknown) => {
      toast({
        title: 'Payment Recording Failed',
        description: getApiErrorMessage(error, 'Failed to record payment. Please try again.'),
        variant: 'destructive',
      });
    },
  });

  const handleRazorpayPayment = async () => {
    if (!fees) return;
    setProcessing(true);

    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast({ title: 'Failed to load payment gateway', variant: 'destructive' });
        setProcessing(false);
        return;
      }

      const orderData = await createOrderMutation.mutateAsync({
        applicationId,
        paymentType: 'APPLICATION_FEE',
        amount: fees.totalPayable || fees.total,
      });

      const order = orderData?.data || orderData;

      const options = {
        key: order.razorpayKey || process.env.NEXT_PUBLIC_RAZORPAY_KEY,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'NPC - APCD Empanelment',
        description: 'Application & Empanelment Fee',
        order_id: order.orderId || order.razorpayOrderId,
        handler: function (response: any) {
          verifyMutation.mutate({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
            applicationId,
          });
        },
        prefill: {
          email: order.email || '',
          contact: order.contact || '',
        },
        theme: {
          color: '#1e40af',
        },
        modal: {
          ondismiss: () => setProcessing(false),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => {
        toast({ title: 'Payment failed. Please try again.', variant: 'destructive' });
        setProcessing(false);
      });
      rzp.open();
    } catch (error: unknown) {
      toast({
        title: 'Payment Initiation Failed',
        description: getApiErrorMessage(error, 'Failed to initiate payment. Please try again.'),
        variant: 'destructive',
      });
      setProcessing(false);
    }
  };

  const handleNeftPayment = () => {
    if (!neftForm.utrNumber || !neftForm.neftDate || !neftForm.remitterBankName) {
      toast({ title: 'Please fill all NEFT details', variant: 'destructive' });
      return;
    }
    manualPaymentMutation.mutate({
      applicationId,
      paymentType: 'APPLICATION_FEE',
      amount: fees?.totalPayable || fees?.total,
      utrNumber: neftForm.utrNumber,
      neftDate: neftForm.neftDate,
      remitterBankName: neftForm.remitterBankName,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  if (feesLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/applications">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Payment Checkout</h1>
            <p className="text-muted-foreground">Complete payment for your application</p>
          </div>
        </div>

        {/* Fee Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" /> Fee Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {fees?.breakdown?.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium">
                      {item.label || item.paymentType?.replace(/_/g, ' ')}
                    </p>
                    {item.description && (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                  <p className="font-medium">{formatCurrency(item.amount || 0)}</p>
                </div>
              )) || (
                <>
                  <div className="flex items-center justify-between py-2">
                    <p className="font-medium">Application Fee</p>
                    <p className="font-medium">{formatCurrency(fees?.applicationFee || 25000)}</p>
                  </div>
                  {fees?.empanelmentFee > 0 && (
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium">Empanelment Fee</p>
                        <p className="text-sm text-muted-foreground">
                          {fees?.apcdCount || 1} APCD type(s) × ₹65,000
                        </p>
                      </div>
                      <p className="font-medium">{formatCurrency(fees?.empanelmentFee || 0)}</p>
                    </div>
                  )}
                </>
              )}

              <Separator />

              {fees?.gstAmount > 0 && (
                <div className="flex items-center justify-between py-2">
                  <p className="text-muted-foreground">GST (18%)</p>
                  <p>{formatCurrency(fees?.gstAmount || 0)}</p>
                </div>
              )}

              {fees?.discountAmount > 0 && (
                <div className="flex items-center justify-between py-2 text-green-700">
                  <div>
                    <p className="font-medium">Discount (15%)</p>
                    <p className="text-sm">MSE / Startup / Local Supplier</p>
                  </div>
                  <p className="font-medium">- {formatCurrency(fees?.discountAmount || 0)}</p>
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between py-3 text-lg">
                <p className="font-bold">Total Payable</p>
                <p className="font-bold text-primary">
                  <IndianRupee className="inline h-5 w-5" />
                  {formatCurrency(fees?.totalPayable || fees?.total || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Method */}
        <Tabs value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="razorpay" className="flex-1">
              <CreditCard className="h-4 w-4 mr-2" /> Online Payment (Razorpay)
            </TabsTrigger>
            <TabsTrigger value="neft" className="flex-1">
              <Building2 className="h-4 w-4 mr-2" /> NEFT / RTGS
            </TabsTrigger>
          </TabsList>

          {/* Razorpay Tab */}
          <TabsContent value="razorpay">
            <Card>
              <CardHeader>
                <CardTitle>Online Payment</CardTitle>
                <CardDescription>
                  Pay securely via Razorpay (UPI, Net Banking, Cards, Wallets)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="text-sm text-blue-800">
                    You will be redirected to Razorpay's secure payment gateway. Payment will be
                    instantly verified upon completion.
                  </p>
                </div>

                <Button
                  className="w-full h-12 text-lg"
                  onClick={handleRazorpayPayment}
                  disabled={processing || verifyMutation.isPending}
                >
                  {processing ? (
                    'Processing...'
                  ) : (
                    <>
                      <CreditCard className="h-5 w-5 mr-2" />
                      Pay {formatCurrency(fees?.totalPayable || fees?.total || 0)}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* NEFT Tab */}
          <TabsContent value="neft">
            <Card>
              <CardHeader>
                <CardTitle>NEFT / RTGS Payment</CardTitle>
                <CardDescription>
                  Transfer the amount to the following bank account and submit proof
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Bank Details */}
                <div className="p-4 rounded-lg bg-gray-50 border space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Bank Account Details
                  </h4>
                  {bankDetails ? (
                    <>
                      {[
                        { label: 'Account Name', value: bankDetails.accountName },
                        { label: 'Account Number', value: bankDetails.accountNumber },
                        { label: 'Bank Name', value: bankDetails.bankName },
                        { label: 'Branch', value: bankDetails.branch },
                        { label: 'IFSC Code', value: bankDetails.ifscCode },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">{item.label}</p>
                            <p className="font-medium">{item.value}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(item.value || '')}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <p>
                        <span className="text-muted-foreground">Account Name:</span> National
                        Productivity Council
                      </p>
                      <p>
                        <span className="text-muted-foreground">Bank:</span> State Bank of India
                      </p>
                      <p>
                        <span className="text-muted-foreground">Branch:</span> Lodhi Road, New Delhi
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Contact NPC office for full bank account details.
                      </p>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <p className="font-medium">Amount to Transfer</p>
                    <p className="font-bold text-lg text-primary">
                      {formatCurrency(fees?.totalPayable || fees?.total || 0)}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* NEFT Details Form */}
                <div className="space-y-4">
                  <h4 className="font-medium">Payment Details</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>UTR / Transaction Number *</Label>
                      <Input
                        value={neftForm.utrNumber}
                        onChange={(e) => setNeftForm({ ...neftForm, utrNumber: e.target.value })}
                        placeholder="Enter UTR number"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Payment Date *</Label>
                      <Input
                        type="date"
                        value={neftForm.neftDate}
                        onChange={(e) => setNeftForm({ ...neftForm, neftDate: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Remitter Bank Name *</Label>
                    <Input
                      value={neftForm.remitterBankName}
                      onChange={(e) =>
                        setNeftForm({ ...neftForm, remitterBankName: e.target.value })
                      }
                      placeholder="e.g., HDFC Bank, SBI, ICICI Bank"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Upload Payment Proof (Optional)</Label>
                    <input
                      type="file"
                      onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="mt-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                    <p className="text-sm text-yellow-800">
                      Manual payments require officer verification. Your application will proceed
                      after the payment is verified by an officer.
                    </p>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={handleNeftPayment}
                  disabled={
                    manualPaymentMutation.isPending ||
                    !neftForm.utrNumber ||
                    !neftForm.neftDate ||
                    !neftForm.remitterBankName
                  }
                >
                  {manualPaymentMutation.isPending ? (
                    'Submitting...'
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Submit Payment Details
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
