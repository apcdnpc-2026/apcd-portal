'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useAuthStore } from '@/store/auth-store';
import { apiPost } from '@/lib/api';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      // Clear any stale auth state before login
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userId');
      localStorage.removeItem('auth-storage');

      const response = await apiPost<{
        success: boolean;
        data: {
          user: any;
          accessToken: string;
          refreshToken: string;
        };
      }>('/auth/login', data);

      const authData = response.data;
      const user = {
        ...authData.user,
        name: `${authData.user.firstName} ${authData.user.lastName}`,
      };

      // Store auth state (setAuth writes to both localStorage and Zustand)
      setAuth(user, authData.accessToken, authData.refreshToken);

      toast({
        title: 'Login Successful',
        description: `Welcome back, ${user.name}!`,
      });

      // Redirect based on role
      const roleRoutes: Record<string, string> = {
        OEM: '/dashboard/oem',
        OFFICER: '/dashboard/officer',
        ADMIN: '/dashboard/admin',
        SUPER_ADMIN: '/dashboard/admin',
        COMMITTEE: '/dashboard/committee',
        FIELD_VERIFIER: '/dashboard/field-verifier',
      };

      router.replace(roleRoutes[authData.user.role] || '/dashboard');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Invalid credentials';
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: errorMessage,
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
          <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center">
            <span className="text-gov-blue font-bold">NPC</span>
          </div>
          <div>
            <h1 className="text-xl font-bold">APCD OEM Empanelment Portal</h1>
            <p className="text-sm text-blue-200">National Productivity Council for CPCB</p>
          </div>
        </div>
      </header>

      {/* Login Form */}
      <main className="flex-1 flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome Back</CardTitle>
            <CardDescription>Sign in to your account to continue</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
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
              </div>

              <div className="flex items-center justify-between">
                <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>

              <p className="text-sm text-center text-muted-foreground">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="text-primary hover:underline">
                  Register as OEM
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-4">
        <div className="container mx-auto px-4 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} National Productivity Council. All rights reserved.</p>
          <p className="text-gray-400 mt-1">
            For CPCB - Central Pollution Control Board
          </p>
        </div>
      </footer>
    </div>
  );
}
