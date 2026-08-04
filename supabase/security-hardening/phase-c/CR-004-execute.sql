-- =====================================================================
-- CR-004-execute.sql — تنفيذ CR-004 (المحوران الأول والثاني)
-- =====================================================================
-- التغيير:
--   CR-004.1: تضييق 11 سياسة من TO PUBLIC إلى authenticated
--   CR-004.2: حذف سياسة "Bootstrap insert first user" (الخيار أ المعتمد)
-- المرجع: docs/security/operations/CR-004-policy-boundary-tightening.md
-- المنهجية: docs/security/operations/change-management.md
-- =====================================================================
-- شروط التنفيذ المسبقة (كلها محققة بالأدلة قبل هذا السكربت):
--   1. تشغيل C3b-policy-snapshot.sql وأرشفة النتيجة كـ "before".
--   2. الموافقة الصريحة على CR-004.1 وCR-004.2.
-- ملاحظة: في محرر Supabase، أي خطأ في بوابات التحقق يوقف بقية السكربت
-- قبل أي أمر تغيير.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) التقاط الحالة "قبل" داخل نفس الجلسة (قراءة فقط)
-- ---------------------------------------------------------------------
create temp table if not exists cr004_before on commit drop as
select
  t.tablename,
  t.policyname,
  to_jsonb(p.roles) as roles
from (values
  ('calibrations', 'Authenticated insert calibrations'),
  ('calibrations', 'Users manage own calibrations'),
  ('campaigns',    'Admins manage campaigns'),
  ('campaigns',    'Authenticated read campaigns'),
  ('devices',      'Authenticated insert devices'),
  ('devices',      'Users manage own devices'),
  ('qr_codes',     'Admins manage qr codes'),
  ('qr_codes',     'Authenticated read qr codes'),
  ('surveys',      'Authenticated insert surveys'),
  ('surveys',      'Users manage own surveys'),
  ('users',        'Admins update user roles'),
  ('users',        'Bootstrap insert first user')
) as t(tablename, policyname)
left join pg_policies p
  on p.schemaname = 'public'
 and p.tablename  = t.tablename
 and p.policyname = t.policyname;

-- ---------------------------------------------------------------------
-- 2) بوابات التحقق — أي فشل يوقف التنفيذ قبل أي DDL
-- ---------------------------------------------------------------------
do $$
declare
  v_count int;
begin
  -- 2.1 كل سياسات التضييق الـ 11 موجودة
  select count(*) into v_count
  from pg_policies p
  join (values
    ('calibrations', 'Authenticated insert calibrations'),
    ('calibrations', 'Users manage own calibrations'),
    ('campaigns',    'Admins manage campaigns'),
    ('campaigns',    'Authenticated read campaigns'),
    ('devices',      'Authenticated insert devices'),
    ('devices',      'Users manage own devices'),
    ('qr_codes',     'Admins manage qr codes'),
    ('qr_codes',     'Authenticated read qr codes'),
    ('surveys',      'Authenticated insert surveys'),
    ('surveys',      'Users manage own surveys'),
    ('users',        'Admins update user roles')
  ) as t(tablename, policyname)
    on p.schemaname = 'public'
   and p.tablename  = t.tablename
   and p.policyname = t.policyname;
  if v_count <> 11 then
    raise exception 'CR-004 ABORT: عدد السياسات المستهدفة غير مطابق (المتوقع 11، الموجود %)', v_count;
  end if;

  -- 2.2 سياسة التمهيد موجودة
  perform 1 from pg_policies
  where schemaname = 'public'
    and tablename = 'users'
    and policyname = 'Bootstrap insert first user';
  if not found then
    raise exception 'CR-004 ABORT: سياسة التمهيد غير موجودة — لا حذف';
  end if;

  -- 2.3 بوابة دور الخدمة (سمة تجاوز الحماية)
  if not exists (
    select 1 from pg_roles where rolname = 'service_role' and rolbypassrls
  ) then
    raise exception 'CR-004 ABORT: service_role لا يمتلك سمة تجاوز RLS';
  end if;

  -- 2.4 لا حماية مفروضة على جدول المستخدمين (مسار الدالة يتجاوز الحماية)
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'users'
      and c.relforcerowsecurity
  ) then
    raise exception 'CR-004 ABORT: FORCE RLS مفعّلة على public.users';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3) تطبيق CR-004.1 — تضييق 11 سياسة إلى authenticated
-- ---------------------------------------------------------------------
alter policy "Authenticated insert calibrations" on public.calibrations to authenticated;
alter policy "Users manage own calibrations"       on public.calibrations to authenticated;

alter policy "Admins manage campaigns"             on public.campaigns   to authenticated;
alter policy "Authenticated read campaigns"        on public.campaigns   to authenticated;

alter policy "Authenticated insert devices"        on public.devices     to authenticated;
alter policy "Users manage own devices"            on public.devices     to authenticated;

alter policy "Admins manage qr codes"              on public.qr_codes    to authenticated;
alter policy "Authenticated read qr codes"         on public.qr_codes    to authenticated;

alter policy "Authenticated insert surveys"        on public.surveys     to authenticated;
alter policy "Users manage own surveys"            on public.surveys     to authenticated;

alter policy "Admins update user roles"            on public.users       to authenticated;

-- ---------------------------------------------------------------------
-- 4) تطبيق CR-004.2 — حذف سياسة التمهيد (الخيار أ المعتمد)
-- ---------------------------------------------------------------------
drop policy "Bootstrap insert first user" on public.users;

-- ---------------------------------------------------------------------
-- 5) شبكة الأدلة — Result Set واحد
-- ---------------------------------------------------------------------
with after_roles as (
  select
    t.tablename,
    t.policyname,
    to_jsonb(p.roles) as roles
  from (values
    ('calibrations', 'Authenticated insert calibrations'),
    ('calibrations', 'Users manage own calibrations'),
    ('campaigns',    'Admins manage campaigns'),
    ('campaigns',    'Authenticated read campaigns'),
    ('devices',      'Authenticated insert devices'),
    ('devices',      'Users manage own devices'),
    ('qr_codes',     'Admins manage qr codes'),
    ('qr_codes',     'Authenticated read qr codes'),
    ('surveys',      'Authenticated insert surveys'),
    ('surveys',      'Users manage own surveys'),
    ('users',        'Admins update user roles'),
    ('users',        'Bootstrap insert first user')
  ) as t(tablename, policyname)
  left join pg_policies p
    on p.schemaname = 'public'
   and p.tablename  = t.tablename
   and p.policyname = t.policyname
),
force_rls as (
  select c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'users'
)
select jsonb_build_object(
  'expected_rows', 0,
  'before', (
    select jsonb_agg(
      jsonb_build_object('table', tablename, 'policy', policyname, 'roles', roles)
      order by tablename, policyname
    ) from cr004_before
  ),
  'after', (
    select jsonb_agg(
      jsonb_build_object(
        'table', tablename,
        'policy', policyname,
        'roles', coalesce(roles, '["MISSING (dropped)"]'::jsonb)
      )
      order by tablename, policyname
    ) from after_roles
  ),
  'force_rls_users', (select relforcerowsecurity from force_rls),
  'final_verdict',
    case
      when (select count(*) from after_roles where roles = '["authenticated"]'::jsonb) = 11
       and (select count(*) from after_roles where roles is null) = 1
       and not (select relforcerowsecurity from force_rls)
      then 'PASS — 11 policies tightened to authenticated; Bootstrap insert first user dropped; RLS intact'
      else 'FAIL — راجع النتائج قبل أي إغلاق'
    end
) as cr004_evidence;

-- ---------------------------------------------------------------------
-- نهاية السكربت — بعد هذا: تشغيل C3b-policy-snapshot.sql لأرشفة "after"
-- ثم إعادة تشغيل C3-privilege-audit.sql + الاختبارات العملية.
-- ---------------------------------------------------------------------
