'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Award,
  Users,
  ClipboardCheck,
  Settings,
  BarChart3,
  UserCog,
  MapPin,
  MessageSquare,
  Receipt,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/store/auth-store';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const adminMenu = [
  { label: 'Dashboard', href: '/dashboard/admin', icon: LayoutDashboard },
  { label: 'User Management', href: '/admin/users', icon: UserCog },
  { label: 'Applications', href: '/verification', icon: FileText },
  { label: 'Certificates', href: '/admin/certificates', icon: Award },
  { label: 'Fee Configuration', href: '/admin/fees', icon: CreditCard },
  { label: 'APCD Types', href: '/admin/apcd-types', icon: Settings },
  { label: 'Reports', href: '/admin/reports', icon: BarChart3 },
];

const menuItems: Record<string, { label: string; href: string; icon: any }[]> = {
  OEM: [
    { label: 'Dashboard', href: '/dashboard/oem', icon: LayoutDashboard },
    { label: 'My Applications', href: '/applications', icon: FileText },
    { label: 'Payments', href: '/payments', icon: CreditCard },
    { label: 'Certificates', href: '/certificates', icon: Award },
    { label: 'Profile', href: '/profile', icon: Users },
  ],
  OFFICER: [
    { label: 'Dashboard', href: '/dashboard/officer', icon: LayoutDashboard },
    { label: 'Pending Verification', href: '/verification', icon: ClipboardCheck },
    { label: 'Field Verification', href: '/field-verification', icon: MapPin },
    { label: 'Payment Verification', href: '/payments/verify', icon: CreditCard },
    { label: 'Queries', href: '/queries', icon: MessageSquare },
    { label: 'Reports', href: '/reports', icon: BarChart3 },
  ],
  ADMIN: adminMenu,
  SUPER_ADMIN: adminMenu,
  COMMITTEE: [
    { label: 'Dashboard', href: '/dashboard/committee', icon: LayoutDashboard },
    { label: 'Pending Review', href: '/committee/pending', icon: ClipboardCheck },
    { label: 'My Evaluations', href: '/committee/evaluations', icon: FileText },
  ],
  FIELD_VERIFIER: [
    { label: 'Dashboard', href: '/dashboard/field-verifier', icon: LayoutDashboard },
    { label: 'My Assignments', href: '/field-verification/assignments', icon: MapPin },
    { label: 'Completed', href: '/field-verification/completed', icon: ClipboardCheck },
  ],
  DEALING_HAND: [
    { label: 'Dashboard', href: '/dashboard/dealing-hand', icon: LayoutDashboard },
    { label: 'Lab Bills', href: '/dealing-hand/lab-bills', icon: Receipt },
    { label: 'Payment Support', href: '/dealing-hand/payments', icon: CreditCard },
  ],
};

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const userRole = useUserRole();
  const items = userRole ? menuItems[userRole] || [] : [];

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-full w-64 bg-white border-r transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:z-auto',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile close button */}
        <div className="flex items-center justify-between p-4 border-b md:hidden">
          <span className="font-semibold">Menu</span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Menu items */}
        <nav className="p-4 space-y-1">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
          <p className="text-xs text-muted-foreground text-center">
            &copy; {new Date().getFullYear()} NPC
          </p>
        </div>
      </aside>
    </>
  );
}
