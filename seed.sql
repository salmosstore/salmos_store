INSERT OR IGNORE INTO categories (name, slug, sort_order, active) VALUES
('Remeras', 'remeras', 10, 1),
('Gorras', 'gorras', 20, 1),
('Vasos', 'vasos', 30, 1),
('Agendas', 'agendas', 40, 1),
('Mochilas', 'mochilas', 50, 1);

INSERT OR REPLACE INTO settings (key, value) VALUES
('whatsapp', '5491162691341'),
('instagram', ''),
('facebook', ''),
('pickup_enabled', 'false'),
('pickup_address', ''),
('pickup_instructions', ''),
('moto_rate_per_km', '800'),
('moto_max_km', '50'),
('moto_min_hours', '1'),
('moto_max_hours', '4');
