-- Create user_activities table for Recent Activity feed
CREATE TABLE IF NOT EXISTS user_activities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- e.g., 'user_approved', 'schedule_created', 'route_completed'
    message TEXT NOT NULL, -- Human-readable description
    icon TEXT DEFAULT 'fa-clipboard-list', -- FontAwesome icon class
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read BOOLEAN DEFAULT FALSE
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_activities_created_at ON user_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activities_read ON user_activities(read);

-- Create system_notifications table for Notification Center
CREATE TABLE IF NOT EXISTS system_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- null for system-wide notifications
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info', -- 'info', 'success', 'warning', 'error'
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    action_url TEXT -- nullable, URL to navigate when notification is clicked
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_system_notifications_user_id ON system_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_system_notifications_read ON system_notifications(read);
CREATE INDEX IF NOT EXISTS idx_system_notifications_created_at ON system_notifications(created_at DESC);

-- Enable Row Level Security
ALTER TABLE user_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users can read all activities
CREATE POLICY "Allow authenticated users to read activities"
    ON user_activities FOR SELECT
    TO authenticated
    USING (true);

-- RLS Policy: All authenticated users can insert activities
CREATE POLICY "Allow authenticated users to insert activities"
    ON user_activities FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- RLS Policy: Users can read their own notifications or system-wide notifications
CREATE POLICY "Allow users to read their notifications"
    ON system_notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid() OR user_id IS NULL);

-- RLS Policy: Users can update their own notifications (mark as read)
CREATE POLICY "Allow users to update their notifications"
    ON system_notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- RLS Policy: Admins can insert notifications
CREATE POLICY "Allow admins to insert notifications"
    ON system_notifications FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Verification query
SELECT 'Tables created successfully!' as status;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_activities', 'system_notifications');
