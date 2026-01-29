'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { apiPost, getApiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';

const registerSchema = z
  .object({
    firstName: z.string().min(2, 'First name must be at least 2 characters'),
    lastName: z.string().min(2, 'Last name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[!@#$%^&*]/, 'Password must contain at least one special character (!@#$%^&*)'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    try {
      const response = await apiPost<{
        success: boolean;
        data: {
          user: any;
          accessToken: string;
          refreshToken: string;
        };
      }>('/auth/register', {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        password: data.password,
      });

      const authData = response.data;
      const user = {
        ...authData.user,
        name: `${authData.user.firstName} ${authData.user.lastName}`,
      };

      // Store userId for refresh token mechanism
      localStorage.setItem('userId', authData.user.id);
      // Auto-login after registration
      setAuth(user, authData.accessToken, authData.refreshToken);

      toast({
        title: 'Registration Successful',
        description: 'Welcome! You can now start your empanelment application.',
      });

      // Redirect to OEM dashboard to start application
      router.push('/dashboard/oem');
    } catch (error: unknown) {
      const status = (error as any)?.response?.status;
      const title =
        status === 409
          ? 'Email Already Registered'
          : status === 400
            ? 'Invalid Registration Details'
            : 'Registration Failed';
      toast({
        variant: 'destructive',
        title,
        description: getApiErrorMessage(error, 'Registration failed. Please try again.'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Government Header */}
      <div className="gov-stripe" />
      <header className="bg-gov-blue text-white py-4">
        <div className="container mx-auto px-4 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center">
              <span className="text-gov-blue font-bold">NPC</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">APCD OEM Empanelment Portal</h1>
              <p className="text-sm text-blue-200">National Productivity Council for CPCB</p>
            </div>
          </Link>
        </div>
      </header>

      {/* Registration Form */}
      <main className="flex-1 flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>
            <CardTitle className="text-2xl">OEM Registration</CardTitle>
            <CardDescription>
              Register as an Air Pollution Control Device manufacturer to start your empanelment
              application
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" placeholder="Enter first name" {...register('firstName')} />
                  {errors.firstName && (
                    <p className="text-sm text-red-500">{errors.firstName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" placeholder="Enter last name" {...register('lastName')} />
                  {errors.lastName && (
                    <p className="text-sm text-red-500">{errors.lastName.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  {...register('email')}
                />
                {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Mobile Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="10-digit mobile number"
                  {...register('phone')}
                />
                {errors.phone && <p className="text-sm text-red-500">{errors.phone.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a strong password"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-red-500">{errors.password.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Must contain: 8+ chars, uppercase, lowercase, number, special char (!@#$%^&*)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create Account & Start Application'
                )}
              </Button>

              <p className="text-sm text-center text-muted-foreground">
                Already have an account?{' '}
                <Link href="/login" className="text-primary hover:underline">
                  Login here
                </Link>
              </p>

              <p className="text-xs text-center text-muted-foreground">
                By registering, you agree to our Terms of Service and Privacy Policy
              </p>
            </CardFooter>
          </form>
        </Card>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-4">
        <div className="container mx-auto px-4 text-center text-sm">
          <p>
            &copy; {new Date().getFullYear()} National Productivity Council. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
