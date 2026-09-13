import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Which bottom-nav destination a screen belongs under — mirrors the
/// original `Layout.tsx`'s always-visible 5-item bottom nav (Home,
/// Customers, a raised center Check-In action, Rooms, Settings), kept on
/// every screen including customer detail/edit/guest sub-pages.
enum AppTab { dashboard, customers, checkIn, rooms, settings }

/// The shared page shell every screen is built on: an [AppBar] with an
/// optional title/subtitle/back button/actions, and the persistent bottom
/// navigation bar with a docked, raised Check-In action — the Material 3
/// equivalent of the original's visually-raised center nav button.
class AppScaffold extends StatelessWidget {
  final AppTab tab;
  final String title;
  final String? subtitle;
  final bool showBack;
  final List<Widget>? actions;
  final Widget body;
  final Widget? floatingAction;

  const AppScaffold({
    super.key,
    required this.tab,
    required this.title,
    this.subtitle,
    this.showBack = false,
    this.actions,
    required this.body,
    this.floatingAction,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        leading: showBack
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => Navigator.of(context).canPop() ? Navigator.of(context).pop() : context.go('/'),
              )
            : null,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge, overflow: TextOverflow.ellipsis),
            if (subtitle != null)
              Text(
                subtitle!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
                overflow: TextOverflow.ellipsis,
              ),
          ],
        ),
        actions: actions,
      ),
      body: SafeArea(top: false, child: body),
      floatingActionButton: floatingAction ??
          FloatingActionButton(
            // Disabled: the FAB is present on nearly every screen with the
            // same tag, so Hero would fly it between routes on top of the
            // page transition, fighting it rather than complementing it.
            heroTag: null,
            tooltip: 'New Check-In',
            onPressed: tab == AppTab.checkIn ? null : () => context.go('/check-in'),
            child: const Icon(Icons.add),
          ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      bottomNavigationBar: _BottomBar(current: tab),
    );
  }
}

class _BottomBar extends StatelessWidget {
  final AppTab current;
  const _BottomBar({required this.current});

  @override
  Widget build(BuildContext context) {
    return BottomAppBar(
      shape: const CircularNotchedRectangle(),
      notchMargin: 8,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _NavIcon(icon: Icons.home_outlined, selectedIcon: Icons.home, label: 'Home', selected: current == AppTab.dashboard, onTap: () => context.go('/')),
          _NavIcon(
            icon: Icons.people_outline,
            selectedIcon: Icons.people,
            label: 'Customers',
            selected: current == AppTab.customers,
            onTap: () => context.go('/customers'),
          ),
          const SizedBox(width: 48), // space for the docked FAB
          _NavIcon(icon: Icons.door_front_door_outlined, selectedIcon: Icons.door_front_door, label: 'Rooms', selected: current == AppTab.rooms, onTap: () => context.go('/rooms')),
          _NavIcon(
            icon: Icons.settings_outlined,
            selectedIcon: Icons.settings,
            label: 'Settings',
            selected: current == AppTab.settings,
            onTap: () => context.go('/settings'),
          ),
        ],
      ),
    );
  }
}

class _NavIcon extends StatelessWidget {
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _NavIcon({required this.icon, required this.selectedIcon, required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = selected ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.onSurfaceVariant;
    return InkWell(
      onTap: onTap,
      customBorder: const StadiumBorder(),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(selected ? selectedIcon : icon, color: color, size: 24),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: selected ? FontWeight.w600 : FontWeight.w400)),
          ],
        ),
      ),
    );
  }
}
