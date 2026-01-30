'use client';

import { Bell, LogOut, User, Menu } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore, useUser } from '@/store/auth-store';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const user = useUser();
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Government Stripe */}
      <div className="gov-stripe" />

      <div className="flex h-16 items-center px-4 md:px-6">
        {/* Mobile Menu Button */}
        <Button variant="ghost" size="icon" className="md:hidden mr-2" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>

        {/* Logo Section */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-gov-blue flex items-center justify-center">
              <span className="text-white font-bold text-sm">NPC</span>
            </div>
            <div className="hidden md:block">
              <h1 className="text-lg font-bold text-gov-blue">APCD OEM Portal</h1>
              <p className="text-xs text-muted-foreground">National Productivity Council</p>
            </div>
          </Link>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="py-6 text-center text-sm text-muted-foreground">
                No new notifications
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground text-sm font-medium">
                    {user?.name?.charAt(0) || 'U'}
                  </span>
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium">{user?.name || 'User'}</p>
                  <p className="text-xs text-muted-foreground">{user?.role || 'Role'}</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile" className="flex items-center">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
