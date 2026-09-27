-- Reference data. Everything here is editable later from the masters/settings screens.
-- To extend: add rows to the VALUES lists below (or insert via the app).

-- Permissions -------------------------------------------------------------
insert into public.permissions (key, description) values
  ('masters.categories.write',            'Manage categories'),
  ('masters.unit_types.write',            'Manage unit types'),
  ('masters.units.write',                 'Manage units'),
  ('masters.items.write',                 'Manage items'),
  ('masters.item_unit_conversions.write', 'Manage item-specific unit conversions'),
  ('masters.field_definitions.write',     'Manage custom fields'),
  ('settings.write',                      'Change application settings'),
  ('prices.read',                         'View prices and price history'),
  ('prices.write',                        'Create and change daily prices'),
  ('calculations.write',                  'Create and edit own draft calculations'),
  ('calculations.finalize',               'Finalize own calculations'),
  ('calculations.cancel',                 'Cancel any calculation'),
  ('calculations.read_all',               'View calculations of all users'),
  ('reports.read',                        'View reports and exports'),
  ('users.manage',                        'Manage users and roles'),
  ('audit.read',                          'View audit log');

-- Roles -------------------------------------------------------------------
insert into public.roles (key, name, sort_order) values
  ('admin', 'Admin', 1),
  ('user',  'User',  2);

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r cross join public.permissions p where r.key = 'admin';

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key in ('prices.read', 'calculations.write', 'calculations.finalize')
where r.key = 'user';

-- Settings ----------------------------------------------------------------
insert into public.app_settings (key, value, data_type, label, description, options, sort_order) values
  ('business.timezone',       '"Asia/Kolkata"', 'text',   'Business timezone',   'IANA timezone that defines the business date', null, 1),
  ('currency.code',           '"INR"',          'text',   'Currency code',       'ISO 4217 code', null, 2),
  ('currency.symbol',         '"₹"',            'text',   'Currency symbol',     null, null, 3),
  ('currency.locale',         '"en-IN"',        'text',   'Number format locale','Used for grouping, e.g. 1,23,000', null, 4),
  ('money.scale',             '2',              'number', 'Amount decimals',     'Decimals kept for amounts', null, 5),
  ('money.rounding_mode',     '"HALF_UP"',      'select', 'Rounding mode',       'Applied once, to each line amount', '["HALF_UP","HALF_EVEN","DOWN","UP"]', 6),
  ('calculation.duplicate_line_policy', '"merge"', 'select', 'Duplicate item lines', 'What happens when an item is added twice', '["merge","allow"]', 7),
  ('calculation.reference_prefix',      '"CAL-"',  'text',   'Reference prefix',     null, null, 8),
  ('calculation.reference_padding',     '6',       'number', 'Reference digits',     'CAL-000123 uses 6', null, 9),
  ('prices.allow_copy_previous',        'true',    'boolean','Allow copying previous price', 'Explicit user action only', null, 10);

-- Unit types & units -------------------------------------------------------
insert into public.unit_types (key, name, sort_order) values
  ('weight', 'Weight', 1),
  ('volume', 'Volume', 2),
  ('count',  'Count',  3),
  ('pack',   'Pack',   4);

-- Base units first
insert into public.units (name, symbol, unit_type_id, conversion_factor, decimal_precision, sort_order)
select v.name, v.symbol, t.id, 1, v.prec, v.sort
from (values
  ('Kilogram', 'kg',     'weight', 3, 1),
  ('Litre',    'L',      'volume', 3, 3),
  ('Piece',    'pc',     'count',  0, 5),
  ('Box',      'box',    'pack',   0, 7),
  ('Packet',   'pkt',    'pack',   0, 8),
  ('Bundle',   'bundle', 'pack',   0, 9)
) as v(name, symbol, type_key, prec, sort)
join public.unit_types t on t.key = v.type_key;

-- Derived units
insert into public.units (name, symbol, unit_type_id, base_unit_id, conversion_factor, decimal_precision, sort_order)
select v.name, v.symbol, b.unit_type_id, b.id, v.factor, v.prec, v.sort
from (values
  ('Gram',       'g',     'kg', 0.001, 0, 2),
  ('Millilitre', 'ml',    'L',  0.001, 0, 4),
  ('Dozen',      'dozen', 'pc', 12,    2, 6)
) as v(name, symbol, base_symbol, factor, prec, sort)
join public.units b on b.symbol = v.base_symbol;

-- Categories ----------------------------------------------------------------
insert into public.categories (name, sort_order) values
  ('Vegetable', 1),
  ('Fruit',     2),
  ('Other',     9);

insert into public.categories (name, parent_id, sort_order)
select v.name, p.id, v.sort
from (values ('Leafy Vegetable', 3), ('Root Vegetable', 4)) as v(name, sort)
join public.categories p on p.name = 'Vegetable';

-- Items ---------------------------------------------------------------------
insert into public.items (name, category_id, pricing_unit_id, default_unit_id, sort_order)
select v.name, c.id, pu.id, du.id, v.sort
from (values
  ('Potato',      'Root Vegetable',  'kg',     'kg',     1),
  ('Onion',       'Root Vegetable',  'kg',     'kg',     2),
  ('Tomato',      'Vegetable',       'kg',     'kg',     3),
  ('Chilli',      'Vegetable',       'kg',     'g',      4),
  ('Cucumber',    'Vegetable',       'kg',     'kg',     5),
  ('Carrot',      'Root Vegetable',  'kg',     'kg',     6),
  ('Cabbage',     'Leafy Vegetable', 'kg',     'kg',     7),
  ('Cauliflower', 'Vegetable',       'kg',     'kg',     8),
  ('Spinach',     'Leafy Vegetable', 'bundle', 'bundle', 9),
  ('Brinjal',     'Vegetable',       'kg',     'kg',     10),
  ('Capsicum',    'Vegetable',       'kg',     'kg',     11),
  ('Lady Finger', 'Vegetable',       'kg',     'kg',     12),
  ('Apple',       'Fruit',           'kg',     'kg',     13),
  ('Banana',      'Fruit',           'dozen',  'dozen',  14),
  ('Mango',       'Fruit',           'kg',     'kg',     15),
  ('Orange',      'Fruit',           'kg',     'kg',     16),
  ('Grapes',      'Fruit',           'kg',     'kg',     17),
  ('Papaya',      'Fruit',           'kg',     'kg',     18),
  ('Pomegranate', 'Fruit',           'kg',     'kg',     19),
  ('Watermelon',  'Fruit',           'kg',     'kg',     20)
) as v(name, category, pricing_unit, default_unit, sort)
join public.categories c on c.name = v.category
join public.units pu on pu.symbol = v.pricing_unit
join public.units du on du.symbol = v.default_unit;

-- Example item-specific conversion: a box of mangoes weighs 5 kg
insert into public.item_unit_conversions (item_id, from_unit_id, to_unit_id, factor)
select i.id, f.id, t.id, 5
from public.items i, public.units f, public.units t
where i.name = 'Mango' and f.symbol = 'box' and t.symbol = 'kg';

-- Example custom field (shows the dynamic-field engine end to end)
insert into public.field_definitions (entity, key, label, data_type, options, show_in_list, mobile_visible, form_order, list_order)
values ('items', 'origin', 'Origin', 'select', '["Local","Other state","Imported"]', true, false, 1, 1);
