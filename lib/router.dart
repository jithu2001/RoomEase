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

/// Route table — mirrors `App.tsx`'s `<Routes>`.
final GoRouter appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const DashboardPage()),
    GoRoute(
      path: '/customers',
      builder: (context, state) => CustomersPage(initialSearch: state.uri.queryParameters['q']),
    ),
    GoRoute(
      path: '/customers/:id',
      builder: (context, state) => CustomerDetailsPage(customerId: int.parse(state.pathParameters['id']!)),
    ),
    GoRoute(
      path: '/customers/:id/edit',
      builder: (context, state) => EditCustomerPage(customerId: int.parse(state.pathParameters['id']!)),
    ),
    GoRoute(
      path: '/customers/:id/guests/new',
      builder: (context, state) => GuestFormPage(customerId: int.parse(state.pathParameters['id']!)),
    ),
    GoRoute(
      path: '/customers/:id/guests/:guestId/edit',
      builder: (context, state) => GuestFormPage(
        customerId: int.parse(state.pathParameters['id']!),
        guestId: int.parse(state.pathParameters['guestId']!),
      ),
    ),
    GoRoute(path: '/check-in', builder: (context, state) => const CheckInPage()),
    GoRoute(path: '/reports', builder: (context, state) => const ReportsPage()),
    GoRoute(path: '/rooms', builder: (context, state) => const RoomsPage()),
    GoRoute(path: '/settings', builder: (context, state) => const SettingsPage()),
  ],
);
