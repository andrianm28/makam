"use client";

import { LogOutIcon, MailIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { keluarDariBrowserIni } from "@/app/akun/keluar-button";
import { BrandLogo } from "@/components/makam/brand-logo";
import { LokasiSwitcher, type LokasiOption } from "@/components/makam/lokasi-switcher";
import { RoleSwitcher } from "@/components/makam/role-switcher";
import { ThemeToggle } from "@/components/makam/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { StaffRole } from "@/domain/identity";
import type { StaffShell as StaffShellData } from "@/server/staff-area";
import {
  bottomNavItems,
  hasBottomNav,
  isActiveItem,
  lokasiSwitchHref,
  menuRole,
  staffBreadcrumbs,
  staffMenu,
  staffPage,
  type NavGroup,
  type NavItem,
  type PaletteGroup,
} from "@/lib/staff-navigation";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { NotificationBell } from "./notification-bell";

/**
 * The staff area's frame for every staff role: a collapsible sidebar with the
 * current role's menu (a sheet on phones), and a header with breadcrumbs, the
 * role switcher, the command palette, the Peringatan Staf bell, the
 * light/dark toggle and the account menu (Keluar). Pages render inside it
 * unchanged.
 */
export function StaffShell({
  shell,
  defaultSidebarOpen,
  children,
}: {
  shell: StaffShellData;
  defaultSidebarOpen: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const page = staffPage(pathname);
  // Only ever the menu of a role the Akun holds.
  const role = menuRole(
    pathname,
    shell.roles.map((option) => option.role),
  );
  const current = shell.roles.find((option) => option.role === role) ?? shell.roles[0];
  const menu = staffMenu(role, { lokasiId: role === page.role ? page.lokasiId : undefined });
  const roleLabel = current.label;
  const roleHome = current.href;
  // The palette offers the current role's own pages, same as the sidebar menu above.
  const palette: PaletteGroup[] = shell.palette[role] ?? [];
  // Mitra Jasa and Petugas Lapangan: a bottom navigation instead of the sheet sidebar on phones.
  const bottomNav = hasBottomNav(role);

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <StaffSidebar menu={menu} roleLabel={roleLabel} roleHome={roleHome} pathname={pathname} />
        <SidebarInset className="min-w-0">
          <ShellHeader shell={shell} role={page.role} lokasiId={page.lokasiId} pathname={pathname} palette={palette} bottomNav={bottomNav} />
          <div
            className={cn(
              "mx-auto flex w-full max-w-(--page-max-width) flex-1 flex-col gap-6 px-(--page-gutter) pt-6 pb-16 md:pt-8",
              bottomNav && "pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1.5rem)] md:pb-16",
            )}
          >
            {children}
          </div>
          {bottomNav ? <BottomNav items={bottomNavItems(role)} roleLabel={roleLabel} pathname={pathname} /> : null}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function StaffSidebar({
  menu,
  roleLabel,
  roleHome,
  pathname,
}: {
  menu: NavGroup[];
  roleLabel: string;
  roleHome: string;
  pathname: string;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-(--header-height) justify-center border-b border-sidebar-border px-3">
        <Link
          href={roleHome}
          aria-label={`Makam.co.id, Area Staf: Beranda ${roleLabel}`}
          className="flex items-center rounded-md px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          onClick={() => setOpenMobile(false)}
        >
          <BrandLogo caption={`Area Staf · ${roleLabel}`} />
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0 py-2">
        <nav aria-label={`Menu ${roleLabel}`}>
          {menu.map((group) => (
            <SidebarGroup key={group.label} className="py-1.5">
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    if (!item.href) {
                      return (
                        <SidebarMenuItem key={item.label}>
                          <SidebarMenuButton disabled tooltip={`${item.label}: segera hadir`} className="text-muted-foreground">
                            <item.icon aria-hidden />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                          <SidebarMenuBadge className="text-caption font-normal text-muted-foreground">Segera</SidebarMenuBadge>
                        </SidebarMenuItem>
                      );
                    }
                    const active = isActiveItem(item, pathname);
                    return (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                          isActive={active}
                          tooltip={item.label}
                          render={
                            <Link href={item.href} onClick={() => setOpenMobile(false)} aria-current={active ? "page" : undefined} />
                          }
                          className="data-active:bg-brand-soft data-active:font-semibold data-active:text-brand-soft-foreground"
                        >
                          <item.icon aria-hidden />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function ShellHeader({
  shell,
  role,
  lokasiId,
  pathname,
  palette,
  bottomNav,
}: {
  shell: StaffShellData;
  role: StaffRole | null;
  lokasiId?: string;
  pathname: string;
  palette: PaletteGroup[];
  bottomNav: boolean;
}) {
  const trail = staffBreadcrumbs(pathname, (id) => shell.lokasiNames[id]);
  const current = trail[trail.length - 1];
  const roleOptions = shell.roles.map((option) => ({ value: option.role, label: option.label, href: option.href }));
  // Only on an Admin Lokasi page scoped to one of its own Lokasi Mitra; LokasiSwitcher itself hides when there is one.
  const lokasiOptions: LokasiOption[] =
    role === "admin_lokasi" && lokasiId
      ? shell.adminLokasi.map((item) => ({ value: item.id, label: item.name, href: lokasiSwitchHref(pathname, lokasiId, item.id) }))
      : [];

  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md supports-backdrop-filter:bg-background/70 md:px-4">
      {/* Mitra Jasa and Petugas Lapangan navigate by the bottom navigation on phones: no sheet to open there. */}
      <SidebarTrigger className={cn("-ml-1", bottomNav && "max-md:hidden")} />
      <Separator orientation="vertical" className="mx-1 h-5 max-md:hidden" />
      <Breadcrumb className="min-w-0 max-md:hidden">
        <BreadcrumbList className="flex-nowrap">
          {trail.map((crumb, index) => (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem className="min-w-0">
                {crumb.href ? (
                  <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <p className="truncate text-small font-medium md:hidden">{current.label}</p>

      <div className="ml-auto flex items-center gap-1.5">
        <LokasiSwitcher lokasi={lokasiOptions} current={lokasiId ?? null} className="max-md:hidden" />
        <RoleSwitcher roles={roleOptions} current={role} className="max-md:hidden" />
        <CommandPalette groups={palette} />
        <NotificationBell unread={shell.alerts.unread} latest={shell.alerts.latest} />
        <ThemeToggle />
        <AccountMenu shell={shell} role={role} lokasi={lokasiOptions} currentLokasi={lokasiId ?? null} />
      </div>
    </header>
  );
}

function AccountMenu({
  shell,
  role,
  lokasi,
  currentLokasi,
}: {
  shell: StaffShellData;
  role: StaffRole | null;
  lokasi: LokasiOption[];
  currentLokasi: string | null;
}) {
  const { email, phoneNumber } = shell.account;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" aria-label="Akun" />}>
        <Avatar className="size-7">
          <AvatarFallback className="bg-brand-soft text-brand-soft-foreground">
            <UserRoundIcon className="size-4" aria-hidden />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
            <span className="text-small font-medium text-foreground">{email}</span>
            {phoneNumber ? <span className="font-normal tabular-nums">{phoneNumber}</span> : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {lokasi.length > 1 ? (
          <DropdownMenuGroup className="md:hidden">
            <DropdownMenuLabel>Ganti Lokasi</DropdownMenuLabel>
            {lokasi.map((option) => (
              <DropdownMenuLinkItem
                key={option.value}
                render={<Link href={option.href} />}
                aria-current={option.value === currentLokasi ? "page" : undefined}
              >
                <span className="flex-1 truncate">{option.label}</span>
                {option.value === currentLokasi ? <span className="text-caption text-brand">Aktif</span> : null}
              </DropdownMenuLinkItem>
            ))}
            <DropdownMenuSeparator />
          </DropdownMenuGroup>
        ) : null}
        {shell.roles.length > 1 ? (
          <DropdownMenuGroup className="md:hidden">
            <DropdownMenuLabel>Masuk sebagai</DropdownMenuLabel>
            {shell.roles.map((option) => (
              <DropdownMenuLinkItem
                key={option.role}
                render={<Link href={option.href} />}
                aria-current={option.role === role ? "page" : undefined}
              >
                <span className="flex-1">{option.label}</span>
                {option.role === role ? <span className="text-caption text-brand">Aktif</span> : null}
              </DropdownMenuLinkItem>
            ))}
            <DropdownMenuSeparator />
          </DropdownMenuGroup>
        ) : null}
        <DropdownMenuGroup>
          <DropdownMenuLinkItem render={<Link href="/akun" />}>
            <UserRoundIcon aria-hidden /> Akun Saya
          </DropdownMenuLinkItem>
          <DropdownMenuLinkItem render={<Link href="/staf/email" />}>
            <MailIcon aria-hidden /> Email
          </DropdownMenuLinkItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void keluarDariBrowserIni()}>
          <LogOutIcon aria-hidden /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Mitra Jasa and Petugas Lapangan's phone shell: a bottom navigation instead
 * of the sheet sidebar (docs/design-system.md, "The staff shell"), safe-area
 * aware, with 44 px touch targets. Every item opens a real page, so none is
 * disabled here.
 */
function BottomNav({ items, roleLabel, pathname }: { items: NavItem[]; roleLabel: string; pathname: string }) {
  return (
    <nav
      aria-label={`Menu ${roleLabel}`}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto flex h-(--bottom-nav-height) max-w-md items-stretch justify-around px-2">
        {items.map((item) => {
          const active = item.href ? isActiveItem(item, pathname) : false;
          return (
            <li key={item.label} className="flex flex-1">
              <Link
                href={item.href ?? "#"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-(--touch-target) flex-1 flex-col items-center justify-center gap-1 rounded-md text-caption outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "font-medium text-brand-soft-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-(--duration-fast)",
                    active && "bg-brand-soft",
                  )}
                >
                  <item.icon className="size-5" aria-hidden />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
