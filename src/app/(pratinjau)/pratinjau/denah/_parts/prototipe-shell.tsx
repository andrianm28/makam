"use client";

/*
 * PROTOTYPE, throwaway. A stand-in for the real staff shell (same sidebar,
 * header, theme toggle), fixed on an Admin Lokasi at one Lokasi Mitra with
 * Denah as the active menu item. No session behind it.
 */
import { ClockIcon, FileClockIcon, GridIcon, InboxIcon, LayoutDashboardIcon, UserRoundIcon } from "lucide-react";
import { BrandLogo } from "@/components/makam/brand-logo";
import { ThemeToggle } from "@/components/makam/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export const LOKASI_NAMA = "Taman Peristirahatan Hijau Asri";

const menu = [
  { label: "Beranda", icon: LayoutDashboardIcon, ada: true },
  { label: "Antrean Lokasi", icon: InboxIcon, ada: false },
  { label: "Denah", icon: GridIcon, ada: true, aktif: true },
  { label: "Jam Operasional", icon: ClockIcon, ada: true },
  { label: "Audit Log", icon: FileClockIcon, ada: true },
];

export function PrototipeShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen>
        <Sidebar collapsible="icon">
          <SidebarHeader className="h-(--header-height) justify-center border-b border-sidebar-border px-3">
            <div className="flex items-center px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <BrandLogo caption="Area Staf · Admin Lokasi" />
            </div>
          </SidebarHeader>
          <SidebarContent className="gap-0 py-2">
            <nav aria-label="Menu Admin Lokasi">
              <SidebarGroup className="py-1.5">
                <SidebarGroupLabel>Lokasi ini</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {menu.map((item) => (
                      <SidebarMenuItem key={item.label}>
                        {item.ada ? (
                          <SidebarMenuButton
                            isActive={item.aktif}
                            tooltip={item.label}
                            aria-current={item.aktif ? "page" : undefined}
                            className="data-active:bg-brand-soft data-active:font-semibold data-active:text-brand-soft-foreground"
                          >
                            <item.icon aria-hidden />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        ) : (
                          <>
                            <SidebarMenuButton disabled tooltip={`${item.label}: segera hadir`} className="text-muted-foreground">
                              <item.icon aria-hidden />
                              <span>{item.label}</span>
                            </SidebarMenuButton>
                            <SidebarMenuBadge className="text-caption font-normal text-muted-foreground">Segera</SidebarMenuBadge>
                          </>
                        )}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </nav>
          </SidebarContent>
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md supports-backdrop-filter:bg-background/70 md:px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mx-1 h-5 max-md:hidden" />
            <Breadcrumb className="min-w-0 max-md:hidden">
              <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">Admin Lokasi</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">{LOKASI_NAMA}</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Denah</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <p className="truncate text-small font-medium md:hidden">Denah</p>
            <div className="ml-auto flex items-center gap-1.5">
              <ThemeToggle />
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Akun">
                <Avatar className="size-7">
                  <AvatarFallback className="bg-brand-soft text-brand-soft-foreground">
                    <UserRoundIcon className="size-4" aria-hidden />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </div>
          </header>
          <div className="mx-auto flex w-full max-w-(--page-max-width) flex-1 flex-col gap-6 px-(--page-gutter) pt-6 pb-16 md:pt-8">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
