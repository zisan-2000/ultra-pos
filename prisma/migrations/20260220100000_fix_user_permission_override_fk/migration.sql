DO $$
BEGIN
    IF to_regclass('public.user_permission_overrides') IS NOT NULL THEN
        ALTER TABLE "user_permission_overrides"
            DROP CONSTRAINT IF EXISTS "user_permission_overrides_userId_fkey";
        ALTER TABLE "user_permission_overrides"
            ADD CONSTRAINT "user_permission_overrides_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
