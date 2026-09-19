import 'package:flutter/material.dart';

import '../../widgets/app_scaffold.dart';

/// Shell for a single Settings section, reached from the Settings index.
class SettingsDetailPage extends StatelessWidget {
  final String title;
  final Widget child;
  const SettingsDetailPage({super.key, required this.title, required this.child});

  @override
  Widget build(BuildContext context) => AppScaffold(
        tab: AppTab.settings,
        title: title,
        showBack: true,
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
          children: [child],
        ),
      );
}
