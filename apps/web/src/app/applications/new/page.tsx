'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Save, Check, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

import { Step2ApcdTypes } from '@/components/application/step2-apcd-types';
import { Step3Documents } from '@/components/application/step3-documents';
import { Step4Review } from '@/components/application/step4-review';
import { Step5InstallationExperience } from '@/components/application/step5-installation-experience';
import { Step6StaffDetails } from '@/components/application/step6-staff-details';
import { Step7FieldVerificationSites } from '@/components/application/step7-field-verification-sites';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { apiPost, apiGet, apiPut, getApiErrorMessage } from '@/lib/api';

const STEPS = [
  { id: 1, title: 'APCD Types', component: Step2ApcdTypes },
  { id: 2, title: 'Documents', component: Step3Documents },
  { id: 3, title: 'Experience', component: Step5InstallationExperience },
  { id: 4, title: 'Staff', component: Step6StaffDetails },
  { id: 5, title: 'Sites', component: Step7FieldVerificationSites },
  { id: 6, title: 'Review & Submit', component: Step4Review },
];

export default function NewApplicationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [applicationId, setApplicationId] = useState<string | null>(null);

  // Check if OEM profile exists
  const { data: profileResponse, isLoading: checkingProfile } = useQuery({
    queryKey: ['oem-profile-check'],
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

  const hasProfile = !!profileResponse?.data;
  const profile = profileResponse?.data;

  // Redirect to profile page if no profile
  useEffect(() => {
    if (!checkingProfile && !hasProfile) {
      toast({
        variant: 'destructive',
        title: 'Profile Required',
        description: 'Please complete your company profile before starting an application.',
      });
      router.push('/profile');
    }
  }, [checkingProfile, hasProfile, router, toast]);

  // Create application mutation
  const createAppMutation = useMutation({
    mutationFn: () => apiPost<{ success: boolean; data: any }>('/applications', {}),
    onSuccess: (response) => {
      setApplicationId(response.data.id);
      toast({ title: 'Application created', description: 'Your application has been started.' });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: 'Application Creation Failed',
        description: getApiErrorMessage(error, 'Failed to create application. Please try again.'),
      });
    },
  });

  // Update application mutation
  const updateAppMutation = useMutation({
    mutationFn: (data: any) =>
      apiPut<{ success: boolean; data: any }>(`/applications/${applicationId}`, data),
    onSuccess: () => {
      toast({ title: 'Application saved', description: 'Your changes have been saved.' });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: getApiErrorMessage(error, 'Failed to save application. Please try again.'),
      });
    },
  });

  // Create application when page loads (if profile exists)
  useEffect(() => {
    if (hasProfile && !applicationId && !createAppMutation.isPending) {
      createAppMutation.mutate();
    }
  }, [hasProfile, applicationId]);

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSaveProgress = async (data: any) => {
    if (applicationId) {
      await updateAppMutation.mutateAsync(data);
    }
  };

  const StepComponent = STEPS[currentStep - 1].component;

  if (checkingProfile || (!hasProfile && !profileResponse)) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  // Show profile required message while redirecting
  if (!hasProfile) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto">
          <Card className="border-red-300 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <Building2 className="h-6 w-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-red-800">Profile Required</h3>
                  <p className="text-red-700 mt-1">
                    You must complete your company profile before starting an empanelment
                    application.
                  </p>
                  <div className="mt-4">
                    <Button asChild>
                      <Link href="/profile">Complete Profile</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <Button variant="ghost" className="mb-4" onClick={() => router.push('/dashboard/oem')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold">New Empanelment Application</h1>
          <p className="text-muted-foreground">Complete all steps to submit your application</p>
        </div>

        {/* Profile Summary */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="p-2 bg-green-100 rounded-full">
            <Building2 className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-green-800">{profile?.companyName}</p>
            <p className="text-sm text-green-700">GST: {profile?.gstRegistrationNo}</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/profile">Edit Profile</Link>
          </Button>
        </div>

        {/* Progress Steps — Mobile: compact indicator, Desktop: full stepper */}
        <Card>
          <CardContent className="pt-6">
            {/* Mobile compact step indicator */}
            <div className="flex sm:hidden items-center justify-between">
              <span className="text-sm font-medium text-primary">
                Step {currentStep} of {STEPS.length}: {STEPS[currentStep - 1].title}
              </span>
              <span className="text-xs text-muted-foreground">
                {Math.round((currentStep / STEPS.length) * 100)}%
              </span>
            </div>
            <div className="sm:hidden mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
              />
            </div>

            {/* Desktop full stepper */}
            <div className="hidden sm:flex items-center justify-between">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-8 w-8 md:h-10 md:w-10 rounded-full flex items-center justify-center text-xs md:text-sm font-medium ${
                        currentStep > step.id
                          ? 'bg-green-500 text-white'
                          : currentStep === step.id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {currentStep > step.id ? (
                        <Check className="h-4 w-4 md:h-5 md:w-5" />
                      ) : (
                        step.id
                      )}
                    </div>
                    <span
                      className={`mt-2 text-xs hidden md:block ${
                        currentStep === step.id
                          ? 'text-primary font-medium'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`h-0.5 w-8 sm:w-12 md:w-24 mx-1 sm:mx-2 ${
                        currentStep > step.id ? 'bg-green-500' : 'bg-muted'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Application Status */}
        {createAppMutation.isPending && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <p className="text-blue-800">Creating your application...</p>
          </div>
        )}

        {/* Step Content */}
        {applicationId && (
          <Card>
            <CardHeader>
              <CardTitle>
                Step {currentStep}: {STEPS[currentStep - 1].title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StepComponent
                applicationId={applicationId}
                onSave={handleSaveProgress}
                onNext={handleNext}
              />
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        {applicationId && (
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handlePrevious} disabled={currentStep === 1}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleSaveProgress({})}
                disabled={updateAppMutation.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                Save Draft
              </Button>

              {currentStep < STEPS.length && (
                <Button onClick={handleNext}>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
