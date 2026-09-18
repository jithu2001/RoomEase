import '../database/app_database.dart';
import '../database/repositories/booking_guest_repository.dart';
import '../database/repositories/customer_repository.dart';
import '../database/repositories/room_repository.dart';
import '../database/repositories/settings_repository.dart';
import '../database/sql_driver.dart';
import 'auto_backup_service.dart';
import 'backup_service.dart';
import 'customer_service.dart';
import 'file_store.dart';
import 'guest_service.dart';
import 'image_service.dart';
import 'report_service.dart';
import 'room_service.dart';
import 'settings_service.dart';
import 'whatsapp_service.dart';

/// Composition root: builds every repository and service once, wired the
/// same way as the original app's `container.ts`.
class Services {
  final SqlDriver db;
  final FileStore files;
  final ImageService images;
  final CustomerService customers;
  final GuestService guests;
  final ReportService reports;
  final RoomService rooms;
  final SettingsService settings;
  final BackupService backup;
  final AutoBackupService autoBackup;
  final WhatsAppService whatsapp;

  const Services({
    required this.db,
    required this.files,
    required this.images,
    required this.customers,
    required this.guests,
    required this.reports,
    required this.rooms,
    required this.settings,
    required this.backup,
    required this.autoBackup,
    required this.whatsapp,
  });
}

Services createServices(SqlDriver db, FileStore files) {
  final customerRepo = CustomerRepository(db);
  final roomRepo = RoomRepository(db);
  final guestRepo = BookingGuestRepository(db);
  final settingsRepo = SettingsRepository(db);

  final images = ImageService(files);
  final rooms = RoomService(roomRepo, customerRepo);
  final customers = CustomerService(customerRepo, roomRepo, rooms, images, guestRepo);
  final guests = GuestService(guestRepo, customerRepo, images);
  final settings = SettingsService(settingsRepo);
  final reports = ReportService(customerRepo, guestRepo, settings);
  final backup = BackupService(db, customerRepo, guestRepo, roomRepo, settingsRepo, files);
  final autoBackup = AutoBackupService(backup, settingsRepo, files, customerRepo);
  final whatsapp = WhatsAppService(settings);

  return Services(
    db: db,
    files: files,
    images: images,
    customers: customers,
    guests: guests,
    reports: reports,
    rooms: rooms,
    settings: settings,
    backup: backup,
    autoBackup: autoBackup,
    whatsapp: whatsapp,
  );
}

Services? _services;

Future<Services> initServices() async {
  final db = await initDatabase();
  return _services ??= createServices(db, DeviceFileStore());
}

Services getServices() {
  final services = _services;
  if (services == null) {
    throw StateError('Services have not been initialised yet.');
  }
  return services;
}
