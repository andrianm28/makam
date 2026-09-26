"use client";

import { BellIcon, LogOutIcon, SearchIcon, SmartphoneIcon, UserRoundIcon } from "lucide-react";
import { ThemeProvider } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { LokasiSwitcher } from "@/components/makam/lokasi-switcher";
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
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { StaffRole } from "@/domain/identity";
import { lokasiAdminLokasi, lokasiById, lokasiMitra, peringatanStaf } from "../_mock/data";
import { BrandMark } from "./brand-mark";
import { BASE, catalogueItem, fieldRoles, menus, pageTitle, roleHome, roleLabels, roleOf } from "./nav";
import { PratinjauProvider } from "./pratinjau-context";
import { PrototypeBar } from "./prototype-bar";

const roleOptions = (Object.keys(roleLabels) as StaffRole[]).map((role) => ({
  value: role,
  label: roleLabels[role],
  href: roleHome[role],
}));

export function AppShell({ children, defaultSidebarOpen }: { children: React.ReactNode; defaultSidebarOpen: boolean }) {
  const pathname = usePathname();
  const role = roleOf(pathname);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const bottomNav = fieldRoles.includes(role);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PratinjauProvider>
        <TooltipProvider>
          <SidebarProvider defaultOpen={defaultSidebarOpen}>
            <AppSidebar role={role} pathname={pathname} />
            <SidebarInset className="min-w-0">
              <ShellHeader role={role} pathname={pathname} bottomNav={bottomNav} onOpenPalette={() => setPaletteOpen(true)} />
              <div
                className={cn(
                  "mx-auto flex w-full max-w-(--page-max-width) flex-1 flex-col gap-(--section-gap) px-(--page-gutter) pt-6 pb-24 md:pt-8",
                  bottomNav && "pb-[calc(var(--bottom-nav-height)+6rem)] md:pb-24",
                )}
              >
                {children}
              </div>
            </SidebarInset>
            {bottomNav ? <BottomNav role={role} pathname={pathname} /> : null}
            <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} role={role} />
            <PrototypeBar />
            <Toaster position="top-center" />
          </SidebarProvider>
        </TooltipProvider>
      </PratinjauProvider>
    </ThemeProvider>
  );
}

function isActive(pathname: string, href: string) {
  if (href === BASE || Object.values(roleHome).includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AppSidebar({ role, pathname }: { role: StaffRole; pathname: string }) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-(--header-height) justify-center border-b border-sidebar-border px-3">
        <Link href={roleHome[role]} className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50" onClick={() => setOpenMobile(false)}>
          <BrandMark />
          <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-small font-semibold text-sidebar-foreground">Makam.co.id</span>
            <span className="text-caption text-muted-foreground">Area Staf</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0 py-2">
        {menus[role].map((group) => (
          <SidebarGroup key={group.label} className="py-1.5">
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        render={<Link href={item.href} onClick={() => setOpenMobile(false)} aria-current={active ? "page" : undefined} />}
                        className="data-active:bg-brand-soft data-active:font-medium data-active:text-brand-soft-foreground"
                      >
                        <item.icon aria-hidden />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.badge ? <SidebarMenuBadge className="tabular-nums">{item.badge}</SidebarMenuBadge> : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname === catalogueItem.href}
              tooltip={catalogueItem.label}
              render={<Link href={catalogueItem.href} onClick={() => setOpenMobile(false)} />}
              className="data-active:bg-brand-soft data-active:text-brand-soft-foreground"
            >
              <catalogueItem.icon aria-hidden />
              <span>{catalogueItem.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {role === "admin_platform" ? <BertugasSwitch /> : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** Admin Platform marks themselves Bertugas to receive urgent Peringatan Staf. */
function BertugasSwitch() {
  const [on, setOn] = useState(true);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn(!on)}
      className="flex items-center gap-2.5 rounded-md px-2 py-2 text-left text-small outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
    >
      <span className={cn("relative flex size-2.5 shrink-0 rounded-full", on ? "bg-success" : "bg-muted-foreground/40")}>
        {on ? <span className="absolute inset-0 animate-ping rounded-full bg-success/50 motion-reduce:hidden" /> : null}
      </span>
      <span className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
        <span className="font-medium text-sidebar-foreground">{on ? "Bertugas" : "Tidak bertugas"}</span>
        <span className="text-caption text-muted-foreground">{on ? "Menerima peringatan mendesak" : "Ketuk untuk mulai bertugas"}</span>
      </span>
    </button>
  );
}

function crumbs(role: StaffRole, pathname: string): { label: string; href?: string }[] {
  const home = { label: roleLabels[role], href: roleHome[role] };
  if (pathname === roleHome[role]) return [{ label: roleLabels[role] }, { label: pageTitle(pathname) ?? "Beranda" }];
  const lokasiMatch = pathname.match(new RegExp(`^${BASE}/lokasi/([^/]+)$`));
  if (lokasiMatch) {
    return [home, { label: "Lokasi Mitra", href: `${BASE}/lokasi` }, { label: lokasiById(lokasiMatch[1])?.name ?? "Lokasi Mitra" }];
  }
  return [home, { label: pageTitle(pathname) ?? "Halaman" }];
}

function ShellHeader({
  role,
  pathname,
  bottomNav,
  onOpenPalette,
}: {
  role: StaffRole;
  pathname: string;
  bottomNav: boolean;
  onOpenPalette: () => void;
}) {
  const [lokasiId, setLokasiId] = useState(lokasiAdminLokasi[0].id);
  const trail = crumbs(role, pathname);
  const current = trail[trail.length - 1];

  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md supports-backdrop-filter:bg-background/70 md:px-4">
      <SidebarTrigger className={cn("-ml-1", bottomNav && "max-md:hidden")} aria-label="Buka atau tutup menu" />
      {bottomNav ? <BrandMark className="size-7 md:hidden" /> : null}
      <Separator orientation="vertical" className="mx-1 h-5 max-md:hidden" />
      <Breadcrumb className="min-w-0 max-md:hidden">
        <BreadcrumbList className="flex-nowrap">
          {trail.map((crumb, index) => (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem className="min-w-0">
                {crumb.href && index < trail.length - 1 ? (
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
        <Button
          variant="outline"
          onClick={onOpenPalette}
          className="w-56 justify-start gap-2 font-normal text-muted-foreground max-lg:hidden"
        >
          <SearchIcon aria-hidden />
          <span className="flex-1 text-left">Cari atau buka halaman</span>
          <kbd className="rounded border border-border bg-muted px-1.5 text-caption font-medium text-muted-foreground">⌘K</kbd>
        </Button>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenPalette} aria-label="Cari atau buka halaman">
          <SearchIcon />
        </Button>
        {role === "admin_lokasi" ? (
          <LokasiSwitcher lokasi={lokasiAdminLokasi} currentId={lokasiId} onSelect={setLokasiId} className="max-md:hidden" />
        ) : null}
        <RoleSwitcher roles={roleOptions} current={role} className="max-md:hidden" />
        <ThemeToggle />
        <NotificationBell />
        <AccountMenu role={role} />
      </div>
    </header>
  );
}

function NotificationBell() {
  const unread = peringatanStaf.filter((item) => item.baru).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative" aria-label={`Peringatan Staf, ${unread} baru`} />}>
        <BellIcon />
        {unread > 0 ? (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-danger text-[0.625rem] font-semibold text-danger-foreground tabular-nums">
            {unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Peringatan Staf</DropdownMenuLabel>
          {peringatanStaf.map((item) => (
            <DropdownMenuItem key={item.id} className="items-start gap-2.5 py-2">
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", item.baru ? "bg-brand" : "bg-transparent")} aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className={cn("text-small", item.baru && "font-medium")}>{item.judul}</span>
                <span className="text-caption text-muted-foreground">{item.waktu}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <SmartphoneIcon /> Atur Perangkat Push
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountMenu({ role }: { role: StaffRole }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="rounded-full" aria-label="Akun: Rina Kartika" />}
      >
        <Avatar className="size-7">
          <AvatarFallback className="bg-brand-soft text-caption font-semibold text-brand-soft-foreground">RK</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
            <span className="text-small font-medium text-foreground">Rina Kartika</span>
            <span className="font-normal">rina@makam.co.id</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="md:hidden">
          <DropdownMenuLabel>Masuk sebagai</DropdownMenuLabel>
          {roleOptions.map((option) => (
            <DropdownMenuItem key={option.value} onClick={() => router.push(option.href)}>
              <span className="flex-1">{option.label}</span>
              {option.value === role ? <span className="text-caption text-brand">Aktif</span> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
        </DropdownMenuGroup>
        <DropdownMenuItem>
          <UserRoundIcon /> Akun Saya
        </DropdownMenuItem>
        <DropdownMenuItem>
          <SmartphoneIcon /> Perangkat Push
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <LogOutIcon /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CommandPalette({ open, onOpenChange, role }: { open: boolean; onOpenChange: (open: boolean) => void; role: StaffRole }) {
  const router = useRouter();
  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Cari atau buka halaman" description="Ketik nama halaman atau Lokasi Mitra">
      <Command>
      <CommandInput placeholder="Ketik nama halaman atau Lokasi Mitra" />
      <CommandList className="max-h-96">
        <CommandEmpty>Tidak ada halaman atau Lokasi Mitra dengan nama itu.</CommandEmpty>
        {menus[role].map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem key={item.href} value={`${item.label} ${group.label}`} onSelect={() => go(item.href)}>
                <item.icon aria-hidden />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {role === "admin_platform" ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Lokasi Mitra">
              {lokasiMitra.slice(0, 6).map((item) => (
                <CommandItem key={item.id} value={`${item.name} ${item.kota}`} onSelect={() => go(`${BASE}/lokasi/${item.id}`)}>
                  <span className="flex-1">{item.name}</span>
                  <span className="text-caption text-muted-foreground">{item.kota}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
        <CommandSeparator />
        <CommandGroup heading="Ganti peran">
          {roleOptions
            .filter((option) => option.value !== role)
            .map((option) => (
              <CommandItem key={option.value} value={`peran ${option.label}`} onSelect={() => go(option.href)}>
                Masuk sebagai {option.label}
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Pratinjau">
          <CommandItem value={catalogueItem.label} onSelect={() => go(catalogueItem.href)}>
            <catalogueItem.icon aria-hidden />
            {catalogueItem.label}
            <CommandShortcut>Tokens</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}

function BottomNav({ role, pathname }: { role: StaffRole; pathname: string }) {
  const items = menus[role].flatMap((group) => group.items);
  return (
    <nav
      aria-label={`Menu ${roleLabels[role]}`}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto flex h-(--bottom-nav-height) max-w-md items-stretch justify-around px-2">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-(--touch-target) flex-1 flex-col items-center justify-center gap-1 rounded-md text-caption outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "font-medium text-brand-soft-foreground" : "text-muted-foreground",
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-(--duration-fast)", active && "bg-brand-soft")}>
                  <item.icon className="size-5" aria-hidden />
                </span>
                {item.label}
                {item.badge ? (
                  <span className="absolute top-1 left-1/2 ml-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-semibold text-danger-foreground tabular-nums">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
