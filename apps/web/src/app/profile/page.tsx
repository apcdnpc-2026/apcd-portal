'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Building2, MapPin, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { apiGet, apiPost, apiPut, getApiErrorMessage } from '@/lib/api';

const FIRM_TYPES = [
  { value: 'PROPRIETARY', label: 'Proprietary' },
  { value: 'PRIVATE_LIMITED', label: 'Private Limited' },
  { value: 'LIMITED_COMPANY', label: 'Limited Company' },
  { value: 'PUBLIC_SECTOR', label: 'Public Sector' },
  { value: 'SOCIETY', label: 'Society' },
];

const FIRM_SIZES = [
  { value: 'COTTAGE', label: 'Cottage' },
  { value: 'MICRO', label: 'Micro' },
  { value: 'SMALL', label: 'Small' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LARGE', label: 'Large' },
];

const profileSchema = z.object({
  companyName: z.string().min(2, 'Company name is required'),
  fullAddress: z.string().min(5, 'Full address is required'),
  state: z.string().min(2, 'State is required'),
  country: z.string().default('India'),
  pinCode: z.string().regex(/^\d{6}$/, 'PIN code must be 6 digits'),
  contactNo: z.string().regex(/^[6-9]\d{9}$/, 'Invalid phone (10 digits, starting with 6-9)'),
  gstRegistrationNo: z
    .string()
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      'Invalid GST number (e.g. 06AABCU9603R1ZM)',
    ),
  panNo: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN (e.g. AABCU9603R)'),
  firmType: z.string().min(1, 'Firm type is required'),
  firmAreaSqm: z.coerce.number().min(0).optional(),
  employeeCount: z.coerce.number().min(0).optional(),
  gpsLatitude: z.coerce.number().min(-90).max(90).optional(),
  gpsLongitude: z.coerce.number().min(-180).max(180).optional(),
  firmSize: z.string().optional(),
  udyamRegistrationNo: z.string().optional(),
  isMSE: z.boolean().default(false),
  isStartup: z.boolean().default(false),
  isLocalSupplier: z.boolean().default(false),
  localContentPercent: z.coerce.number().min(0).max(100).optional(),
  dpiitRecognitionNo: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hasProfile, setHasProfile] = useState(false);

  const { data: profileResponse, isLoading } = useQuery({
    queryKey: ['oem-profile'],
    queryFn: async () => {
      try {
        const response = await apiGet<{ success: boolean; data: any }>('/oem-profile');
        return response;
      } catch (error: any) {
        if (error.response?.status === 404) {
          return null;
        }
        throw error;
      }
    },
  });

  const profile = profileResponse?.data;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      country: 'India',
      isMSE: false,
      isStartup: false,
      isLocalSupplier: false,
    },
  });

  // Populate form when profile data loads
  useEffect(() => {
    if (profile) {
      setHasProfile(true);
      const fields = [
        'companyName',
        'fullAddress',
        'state',
        'country',
        'pinCode',
        'contactNo',
        'gstRegistrationNo',
        'panNo',
        'firmType',
        'firmAreaSqm',
        'employeeCount',
        'gpsLatitude',
        'gpsLongitude',
        'firmSize',
        'udyamRegistrationNo',
        'isMSE',
        'isStartup',
        'isLocalSupplier',
        'localContentPercent',
        'dpiitRecognitionNo',
      ];
      fields.forEach((field) => {
        if (profile[field] !== undefined && profile[field] !== null) {
          setValue(field as keyof ProfileForm, profile[field]);
        }
      });
    }
  }, [profile, setValue]);

  const createMutation = useMutation({
    mutationFn: (data: ProfileForm) => apiPost<any>('/oem-profile', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oem-profile'] });
      toast({
        title: 'Profile Created',
        description: 'Your company profile has been saved successfully.',
      });
      setHasProfile(true);
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: 'Profile Creation Failed',
        description: getApiErrorMessage(error, 'Failed to create profile. Please try again.'),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ProfileForm) => apiPut<any>('/oem-profile', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oem-profile'] });
      toast({ title: 'Profile Updated', description: 'Your company profile has been updated.' });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: 'Profile Update Failed',
        description: getApiErrorMessage(error, 'Failed to update profile. Please try again.'),
      });
    },
  });

  const onSubmit = async (data: ProfileForm) => {
    if (hasProfile) {
      await updateMutation.mutateAsync(data);
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const isMSE = watch('isMSE');
  const isStartup = watch('isStartup');
  const isLocalSupplier = watch('isLocalSupplier');

  if (isLoading) {
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
        <div>
          <h1 className="text-2xl font-bold">Company Profile</h1>
          <p className="text-muted-foreground">
            {hasProfile
              ? 'Update your company details'
              : 'Complete your company profile to start an application'}
          </p>
        </div>

        {!hasProfile && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-800">Profile Required</h3>
            <p className="text-sm text-blue-700 mt-1">
              You must complete your company profile before starting an empanelment application.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Company Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Company Information
              </CardTitle>
              <CardDescription>Basic details about your company</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input id="companyName" {...register('companyName')} />
                  {errors.companyName && (
                    <p className="text-sm text-red-500">{errors.companyName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="firmType">Firm Type *</Label>
                  <Select
                    value={watch('firmType') || ''}
                    onValueChange={(value) => setValue('firmType', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select firm type" />
                    </SelectTrigger>
                    <SelectContent>
                      {FIRM_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.firmType && (
                    <p className="text-sm text-red-500">{errors.firmType.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gstRegistrationNo">GST Registration No. *</Label>
                  <Input
                    id="gstRegistrationNo"
                    {...register('gstRegistrationNo')}
                    placeholder="06AABCU9603R1ZM"
                  />
                  {errors.gstRegistrationNo && (
                    <p className="text-sm text-red-500">{errors.gstRegistrationNo.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="panNo">PAN Number *</Label>
                  <Input id="panNo" {...register('panNo')} placeholder="AABCU9603R" />
                  {errors.panNo && <p className="text-sm text-red-500">{errors.panNo.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactNo">Contact Number *</Label>
                  <Input id="contactNo" {...register('contactNo')} placeholder="9876543210" />
                  {errors.contactNo && (
                    <p className="text-sm text-red-500">{errors.contactNo.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="firmSize">Firm Size</Label>
                  <Select
                    value={watch('firmSize') || ''}
                    onValueChange={(value) => setValue('firmSize', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select firm size" />
                    </SelectTrigger>
                    <SelectContent>
                      {FIRM_SIZES.map((size) => (
                        <SelectItem key={size.value} value={size.value}>
                          {size.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="firmAreaSqm">Firm Area (sq.m)</Label>
                  <Input id="firmAreaSqm" type="number" {...register('firmAreaSqm')} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="employeeCount">Number of Employees</Label>
                  <Input id="employeeCount" type="number" {...register('employeeCount')} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Address Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Address & Location
              </CardTitle>
              <CardDescription>Factory/office address details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullAddress">Full Address *</Label>
                <Input id="fullAddress" {...register('fullAddress')} />
                {errors.fullAddress && (
                  <p className="text-sm text-red-500">{errors.fullAddress.message}</p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="state">State *</Label>
                  <Input id="state" {...register('state')} />
                  {errors.state && <p className="text-sm text-red-500">{errors.state.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" {...register('country')} defaultValue="India" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pinCode">PIN Code *</Label>
                  <Input id="pinCode" {...register('pinCode')} placeholder="122002" />
                  {errors.pinCode && (
                    <p className="text-sm text-red-500">{errors.pinCode.message}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gpsLatitude">GPS Latitude</Label>
                  <Input
                    id="gpsLatitude"
                    type="number"
                    step="any"
                    {...register('gpsLatitude')}
                    placeholder="28.4595"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gpsLongitude">GPS Longitude</Label>
                  <Input
                    id="gpsLongitude"
                    type="number"
                    step="any"
                    {...register('gpsLongitude')}
                    placeholder="77.0266"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Category Declarations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Category Declarations
              </CardTitle>
              <CardDescription>For 15% discount eligibility on empanelment fees</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                  <input type="checkbox" {...register('isMSE')} className="rounded h-4 w-4" />
                  <div>
                    <p className="font-medium">Micro or Small Enterprise (MSE)</p>
                    <p className="text-sm text-muted-foreground">Registered under MSME Act</p>
                  </div>
                </label>

                {isMSE && (
                  <div className="ml-7 space-y-2">
                    <Label htmlFor="udyamRegistrationNo">Udyam Registration No.</Label>
                    <Input
                      id="udyamRegistrationNo"
                      {...register('udyamRegistrationNo')}
                      placeholder="UDYAM-XX-00-0000000"
                    />
                  </div>
                )}

                <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                  <input type="checkbox" {...register('isStartup')} className="rounded h-4 w-4" />
                  <div>
                    <p className="font-medium">DPIIT Recognized Startup</p>
                    <p className="text-sm text-muted-foreground">
                      Recognized by Department for Promotion of Industry and Internal Trade
                    </p>
                  </div>
                </label>

                {isStartup && (
                  <div className="ml-7 space-y-2">
                    <Label htmlFor="dpiitRecognitionNo">DPIIT Recognition No.</Label>
                    <Input id="dpiitRecognitionNo" {...register('dpiitRecognitionNo')} />
                  </div>
                )}

                <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register('isLocalSupplier')}
                    className="rounded h-4 w-4"
                  />
                  <div>
                    <p className="font-medium">Local Supplier (Class-I/II)</p>
                    <p className="text-sm text-muted-foreground">
                      Local content percentage 50% or more
                    </p>
                  </div>
                </label>

                {isLocalSupplier && (
                  <div className="ml-7 space-y-2">
                    <Label htmlFor="localContentPercent">Local Content Percentage</Label>
                    <Input
                      id="localContentPercent"
                      type="number"
                      min="0"
                      max="100"
                      {...register('localContentPercent')}
                      placeholder="65"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => router.push('/dashboard/oem')}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
            >
              {isSubmitting || createMutation.isPending || updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {hasProfile ? 'Update Profile' : 'Save Profile'}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
