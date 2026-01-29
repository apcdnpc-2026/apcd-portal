'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const companyProfileSchema = z.object({
  companyName: z.string().min(2, 'Company name is required'),
  registeredAddress: z.string().min(10, 'Registered address is required'),
  factoryAddress: z.string().min(10, 'Factory address is required'),
  state: z.string().min(2, 'State is required'),
  district: z.string().min(2, 'District is required'),
  pincode: z.string().regex(/^\d{6}$/, 'Invalid pincode (6 digits required)'),
  gstNumber: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/, 'Invalid GST number (e.g. 22AAAAA0000A1Z5)'),
  panNumber: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]{1}$/, 'Invalid PAN number (e.g. AAAAA0000A)'),
  cinNumber: z.string().optional(),
  authorizedPersonName: z.string().min(2, 'Authorized person name is required'),
  authorizedPersonDesignation: z.string().min(2, 'Designation is required'),
  authorizedPersonEmail: z.string().email('Invalid email'),
  authorizedPersonPhone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid phone (10 digits, starting with 6-9)'),
  isMSE: z.boolean().default(false),
  isStartup: z.boolean().default(false),
  isLocalSupplier: z.boolean().default(false),
});

type CompanyProfileForm = z.infer<typeof companyProfileSchema>;

interface Step1Props {
  applicationId: string | null;
  onSave: (data: any) => Promise<void>;
  onNext: () => void;
}

export function Step1CompanyProfile({ applicationId, onSave, onNext }: Step1Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CompanyProfileForm>({
    resolver: zodResolver(companyProfileSchema),
  });

  const onSubmit = async (data: CompanyProfileForm) => {
    await onSave({ oemProfile: data });
    onNext();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Company Information */}
      <div className="space-y-4">
        <h3 className="font-semibold border-b pb-2">Company Information</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name *</Label>
            <Input id="companyName" {...register('companyName')} />
            {errors.companyName && (
              <p className="text-sm text-red-500">{errors.companyName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="gstNumber">GST Number *</Label>
            <Input id="gstNumber" {...register('gstNumber')} placeholder="22AAAAA0000A1Z5" />
            {errors.gstNumber && (
              <p className="text-sm text-red-500">{errors.gstNumber.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="panNumber">PAN Number *</Label>
            <Input id="panNumber" {...register('panNumber')} placeholder="AAAAA0000A" />
            {errors.panNumber && (
              <p className="text-sm text-red-500">{errors.panNumber.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cinNumber">CIN Number (if applicable)</Label>
            <Input id="cinNumber" {...register('cinNumber')} />
          </div>
        </div>
      </div>

      {/* Address Information */}
      <div className="space-y-4">
        <h3 className="font-semibold border-b pb-2">Address Information</h3>

        <div className="space-y-2">
          <Label htmlFor="registeredAddress">Registered Office Address *</Label>
          <Input id="registeredAddress" {...register('registeredAddress')} />
          {errors.registeredAddress && (
            <p className="text-sm text-red-500">{errors.registeredAddress.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="factoryAddress">Factory/Manufacturing Unit Address *</Label>
          <Input id="factoryAddress" {...register('factoryAddress')} />
          {errors.factoryAddress && (
            <p className="text-sm text-red-500">{errors.factoryAddress.message}</p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="state">State *</Label>
            <Input id="state" {...register('state')} />
            {errors.state && <p className="text-sm text-red-500">{errors.state.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="district">District *</Label>
            <Input id="district" {...register('district')} />
            {errors.district && <p className="text-sm text-red-500">{errors.district.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pincode">Pincode *</Label>
            <Input id="pincode" {...register('pincode')} />
            {errors.pincode && <p className="text-sm text-red-500">{errors.pincode.message}</p>}
          </div>
        </div>
      </div>

      {/* Authorized Person */}
      <div className="space-y-4">
        <h3 className="font-semibold border-b pb-2">Authorized Signatory</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="authorizedPersonName">Name *</Label>
            <Input id="authorizedPersonName" {...register('authorizedPersonName')} />
            {errors.authorizedPersonName && (
              <p className="text-sm text-red-500">{errors.authorizedPersonName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorizedPersonDesignation">Designation *</Label>
            <Input id="authorizedPersonDesignation" {...register('authorizedPersonDesignation')} />
            {errors.authorizedPersonDesignation && (
              <p className="text-sm text-red-500">{errors.authorizedPersonDesignation.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorizedPersonEmail">Email *</Label>
            <Input id="authorizedPersonEmail" type="email" {...register('authorizedPersonEmail')} />
            {errors.authorizedPersonEmail && (
              <p className="text-sm text-red-500">{errors.authorizedPersonEmail.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorizedPersonPhone">Phone *</Label>
            <Input id="authorizedPersonPhone" {...register('authorizedPersonPhone')} />
            {errors.authorizedPersonPhone && (
              <p className="text-sm text-red-500">{errors.authorizedPersonPhone.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* Category Declarations */}
      <div className="space-y-4">
        <h3 className="font-semibold border-b pb-2">Category Declarations (for 15% discount eligibility)</h3>

        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('isMSE')} className="rounded" />
            <span className="text-sm">Micro or Small Enterprise (MSE)</span>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('isStartup')} className="rounded" />
            <span className="text-sm">DPIIT Recognized Startup</span>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('isLocalSupplier')} className="rounded" />
            <span className="text-sm">Local Supplier (Class-I/II)</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save & Continue'}
        </Button>
      </div>
    </form>
  );
}
