-- =====================================================================
-- CR-004-rollback.sql — التراجع الكامل عن CR-004 (المحوران الأول والثاني)
-- =====================================================================
-- يُنفَّذ **فقط** إذا استدعى الأمر التراجع بعد تنفيذ CR-004-execute.sql.
-- المرجع: docs/security/operations/CR-004-policy-boundary-tightening.md (القسم 10)
-- المنهجية: docs/security/operations/change-management.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) بوابة تحقق: السياسات المستهدفة موجودة حالياً بصيغة المسجلين
--    (حتى لا يُطبَّق التراجع مرتين أو على سياسات غير متوقعة)
-- ---------------------------------------------------------------------
do $$
declare
  v_count int;
begin
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
   and p.policyname = t.policyname
  where array['authenticated'::name] = p.roles;
  if v_count <> 11 then
    raise exception 'CR-004 ROLLBACK ABORT: لا تطابق كامل مع حالة ما بعد CR-004 (المتوقع 11 سياسة بصلاحية authenticated)';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'Bootstrap insert first user'
  ) then
    raise exception 'CR-004 ROLLBACK ABORT: سياسة التمهيد موجودة أصلاً — لا حاجة لإعادة إنشائها';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) التراجع عن CR-004.1 — إعادة الـ 11 سياسة إلى PUBLIC
-- ---------------------------------------------------------------------
alter policy "Authenticated insert calibrations" on public.calibrations to public;
alter policy "Users manage own calibrations"       on public.calibrations to public;

alter policy "Admins manage campaigns"             on public.campaigns   to public;
alter policy "Authenticated read campaigns"        on public.campaigns   to public;

alter policy "Authenticated insert devices"        on public.devices     to public;
alter policy "Users manage own devices"            on public.devices     to public;

alter policy "Admins manage qr codes"              on public.qr_codes    to public;
alter policy "Authenticated read qr codes"         on public.qr_codes    to public;

alter policy "Authenticated insert surveys"        on public.surveys     to public;
alter policy "Users manage own surveys"            on public.surveys     to public;

alter policy "Admins update user roles"            on public.users       to public;

-- ---------------------------------------------------------------------
-- 3) التراجع عن CR-004.2 — إعادة إنشاء سياسة التمهيد
-- ---------------------------------------------------------------------
create policy "Bootstrap insert first user"
on public.users for insert to public
with check (has_super_admin() = false);

-- ---------------------------------------------------------------------
-- 4) شبكة تحقق — Result Set واحد
-- ---------------------------------------------------------------------
with after_rollback as (
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
)
select jsonb_build_object(
  'expected_rows', 0,
  'policies', (
    select jsonb_agg(
      jsonb_build_object('table', tablename, 'policy', policyname, 'roles', coalesce(roles, '["MISSING"]'::jsonb))
      order by tablename, policyname
    ) from after_rollback
  ),
  'final_verdict',
    case
      when (select count(*) from after_rollback where roles = '["PUBLIC"]'::jsonb) = 12
      then 'PASS — ROLLBACK applied: 12 policies back to PUBLIC (11 tightened + bootstrap recreated)'
      else 'FAIL — راجع النتائج'
    end
) as cr004_rollback_evidence;

-- =====================================================================
-- بعد التراجع: تشغيل C3b-policy-snapshot.sql للتحقق، وإعادة فتح مراجعة C3.
-- =====================================================================
