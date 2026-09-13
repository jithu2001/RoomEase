import 'package:go_router/go_router.dart';

import 'pages/check_in/check_in_page.dart';
import 'pages/customer_details/customer_details_page.dart';
import 'pages/customer_details/edit_customer_page.dart';
import 'pages/customers/customers_page.dart';
import 'pages/dashboard/dashboard_page.dart';
import 'pages/guests/guest_form_page.dart';
import 'pages/reports/reports_page.dart';
import 'pages/rooms/rooms_page.dart';
import 'pages/settings/settings_page.dart';
import 'theme/motion.dart';

/// Route table — mirrors `App.tsx`'s `<Routes>`. Every route swaps in
/// instantly (see `noTransitionPage`): this app is a fast front-desk tool,
/// not something to page through slowly, so navigation stays snappy rather
/// than fading/sliding on every tap.
final GoRouter appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      pageBuilder: (context, state) => noTransitionPage(key: state.pageKey, child: const DashboardPage()),
    ),
    GoRoute(
      path: '/customers',
      pageBuilder: (context, state) => noTransitionPage(
        key: state.pageKey,
        child: CustomersPage(initialSearch: state.uri.queryParameters['q']),
      ),
    ),
    GoRoute(
      path: '/customers/:id',
      pageBuilder: (context, state) => noTransitionPage(
        key: state.pageKey,
        child: CustomerDetailsPage(customerId: int.parse(state.pathParameters['id']!)),
      ),
    ),
    GoRoute(
      path: '/customers/:id/edit',
      pageBuilder: (context, state) => noTransitionPage(
        key: state.pageKey,
        child: EditCustomerPage(customerId: int.parse(state.pathParameters['id']!)),
      ),
    ),
    GoRoute(
      path: '/customers/:id/guests/new',
      pageBuilder: (context, state) => noTransitionPage(
        key: state.pageKey,
        child: GuestFormPage(customerId: int.parse(state.pathParameters['id']!)),
      ),
    ),
    GoRoute(
      path: '/customers/:id/guests/:guestId/edit',
      pageBuilder: (context, state) => noTransitionPage(
        key: state.pageKey,
        child: GuestFormPage(
          customerId: int.parse(state.pathParameters['id']!),
          guestId: int.parse(state.pathParameters['guestId']!),
        ),
      ),
    ),
    GoRoute(
      path: '/check-in',
      pageBuilder: (context, state) => noTransitionPage(key: state.pageKey, child: const CheckInPage()),
    ),
    GoRoute(
      path: '/reports',
      pageBuilder: (context, state) => noTransitionPage(key: state.pageKey, child: const ReportsPage()),
    ),
    GoRoute(
      path: '/rooms',
      pageBuilder: (context, state) => noTransitionPage(key: state.pageKey, child: const RoomsPage()),
    ),
    GoRoute(
      path: '/settings',
      pageBuilder: (context, state) => noTransitionPage(key: state.pageKey, child: const SettingsPage()),
    ),
  ],
);
