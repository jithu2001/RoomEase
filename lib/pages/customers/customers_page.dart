import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../theme/motion.dart';
import '../../utils/app_date.dart';
import '../../widgets/app_scaffold.dart';
import '../../widgets/feedback.dart';

const _pageSize = 25;

class CustomersPage extends StatefulWidget {
  final String? initialSearch;
  const CustomersPage({super.key, this.initialSearch});

  @override
  State<CustomersPage> createState() => _CustomersPageState();
}

class _CustomersPageState extends State<CustomersPage> {
  late final _searchController = TextEditingController(text: widget.initialSearch ?? '');
  Timer? _debounce;
  String _search = '';
  CustomerFilter _filter = CustomerFilter.all;
  int _limit = _pageSize;

  CustomerPage? _page;
  String? _error;
  int? _loadedForDataVersion;

  @override
  void initState() {
    super.initState();
    _search = widget.initialSearch ?? '';
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    final appState = context.read<AppState>();
    _loadedForDataVersion = appState.dataVersion;
    try {
      final page = await appState.services.customers.search(CustomerQuery(
        search: _search.isEmpty ? null : _search,
        filter: _filter,
        limit: _limit,
      ));
      if (mounted) setState(() => _page = page);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () {
      setState(() {
        _search = value;
        _limit = _pageSize;
      });
      _load();
    });
  }

  void _setFilter(CustomerFilter filter) {
    setState(() {
      _filter = filter;
      _limit = _pageSize;
    });
    _load();
  }

  void _loadMore() {
    setState(() => _limit += _pageSize);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    if (_loadedForDataVersion != appState.dataVersion) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }
    return AppScaffold(
      tab: AppTab.customers,
      title: 'Customers',
      subtitle: _page != null ? '${_page!.total} record(s)' : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: TextField(
              controller: _searchController,
              onChanged: _onSearchChanged,
              decoration: InputDecoration(
                hintText: 'Search name, phone, room or code',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () {
                          _searchController.clear();
                          _onSearchChanged('');
                        },
                      )
                    : null,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SegmentedButton<CustomerFilter>(
              segments: const [
                ButtonSegment(value: CustomerFilter.all, label: Text('All')),
                ButtonSegment(value: CustomerFilter.checkedIn, label: Text('Staying')),
                ButtonSegment(value: CustomerFilter.checkedOut, label: Text('Checked Out')),
              ],
              selected: {_filter},
              onSelectionChanged: (s) => _setFilter(s.first),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _error != null
                ? ErrorState(message: _error!, onRetry: _load)
                : _page == null
                    ? const InlineLoading()
                    : _page!.items.isEmpty
                        ? EmptyState(
                            glyph: _search.isNotEmpty || _filter != CustomerFilter.all ? '🔍' : '👥',
                            title: _search.isNotEmpty || _filter != CustomerFilter.all ? 'No customers found' : 'No customers yet',
                            action: _search.isNotEmpty || _filter != CustomerFilter.all
                                ? OutlinedButton(
                                    onPressed: () {
                                      _searchController.clear();
                                      setState(() {
                                        _search = '';
                                        _filter = CustomerFilter.all;
                                      });
                                      _load();
                                    },
                                    child: const Text('Clear search'),
                                  )
                                : FilledButton(onPressed: () => context.go('/check-in'), child: const Text('New Check-In')),
                          )
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.builder(
                              padding: const EdgeInsets.only(bottom: 96),
                              itemCount: _page!.items.length + 1,
                              itemBuilder: (context, index) {
                                if (index == _page!.items.length) {
                                  return _Footer(page: _page!, onLoadMore: _loadMore);
                                }
                                return StaggeredEntrance(index: index, child: _CustomerRow(customer: _page!.items[index]));
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  final CustomerPage page;
  final VoidCallback onLoadMore;
  const _Footer({required this.page, required this.onLoadMore});

  @override
  Widget build(BuildContext context) {
    final left = page.total - page.items.length;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Center(
        child: page.hasMore
            ? OutlinedButton(onPressed: onLoadMore, child: Text('Load more ($left left)'))
            : Text('Showing all ${page.items.length} of ${page.total} records',
                style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 12)),
      ),
    );
  }
}

class _CustomerRow extends StatelessWidget {
  final Customer customer;
  const _CustomerRow({required this.customer});

  @override
  Widget build(BuildContext context) {
    final status = context.statusColors;
    final scheme = Theme.of(context).colorScheme;
    final checkedIn = customer.status == CustomerStatus.checkedIn;
    return ListTile(
      onTap: () => context.push('/customers/${customer.id}'),
      leading: CircleAvatar(
        backgroundColor: scheme.secondaryContainer,
        child: Text(customer.roomNumber, style: const TextStyle(fontSize: 11), textAlign: TextAlign.center),
      ),
      title: Text(customer.name),
      subtitle: Text('${customer.phone} · ${customer.numberOfPersons} person(s) · ${formatDate(customer.checkInDate)}'),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Chip(
            label: Text(checkedIn ? 'In' : 'Out', style: const TextStyle(fontSize: 11)),
            backgroundColor: checkedIn ? status.successContainer : scheme.surfaceContainerHighest,
            labelStyle: TextStyle(color: checkedIn ? status.onSuccessContainer : scheme.onSurfaceVariant),
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
          ),
          const Icon(Icons.chevron_right),
        ],
      ),
    );
  }
}
