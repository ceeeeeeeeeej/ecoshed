// Supabase Configuration
console.log("%c🚀 DISK UPDATE VERIFIED: supabase_config.js loaded (SOURCE)", "color: white; background: blue; padding: 10px; font-size: 20px;");
// Using CDN version for browser compatibility
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Your Supabase project URL and anon key
const SUPABASE_URL = 'https://bfqktqtsjchbmopafgzf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcWt0cXRzamNoYm1vcGFmZ3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDgwMTIsImV4cCI6MjA4NTc4NDAxMn0.Xu7Ncwr5bWYF8x2t5h7XHw_nPrjlTSkQEdnQB4OtcNo';

// Initialize Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Database table names
export const TABLES = {
    USERS: 'users',
    REGISTERED_COLLECTORS: 'registered_collectors',
    USER_ACTIVITIES: 'user_activities',
    NOTIFICATIONS: 'user_notifications', // Updated from 'notifications'
    SYSTEM_SETTINGS: 'system_settings',
    RESIDENT_FEEDBACK: 'resident_feedback',
    SCHEDULED_PICKUPS: 'scheduled_pickups',
    SPECIAL_COLLECTIONS: 'special_collections',
    BINS: 'bins',
    COLLECTION_SCHEDULES: 'collection_schedules',
    AREA_SCHEDULES: 'area_schedules',
    ANNOUNCEMENTS: 'announcements',
    REMINDERS: 'reminders'
};

// User roles
export const USER_ROLES = {
    ADMIN: 'admin',
    SUPERVISOR: 'supervisor',
    COLLECTOR: 'collector',
    RESIDENT: 'resident'
};

// Authentication helper functions
export const authService = {
    // Sign up new user
    async signUp(email, password, userData) {
        try {
            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        first_name: userData.firstName,
                        last_name: userData.lastName,
                        phone: userData.phone,
                        role: userData.role
                    }
                }
            });

            if (error) throw error;

            // SECURITY: All new accounts require superadmin approval by default
            // Only superadmins bypass approval to ensure administrative continuity
            let userStatus = 'pending_approval';

            console.log('signUp - Creating new account with role:', userData.role);

            // Superadmins bypass approval (ensure at least one admin can approve others)
            if (userData.role === 'superadmin') {
                userStatus = 'active';
                console.log('signUp - Superadmin account, setting status to active');
            } else {
                console.log('signUp - Regular account, setting status to pending_approval');
            }

            // Create user profile in database
            if (data.user) {
                const firstName = userData.firstName || '';
                const lastName = userData.lastName || '';
                const role = userData.role || 'admin';

                console.log('signUp - Handling user profile in database for ID:', data.user.id);

                // Use UPSERT to handle cases where auth user exists but DB record doesn't
                // Note: If the database trigger 'on_auth_user_created' is active, 
                // this record might already exist. UPSERT safely handles both cases.
                const { data: insertedData, error: insertError } = await supabase
                    .from(TABLES.USERS)
                    .upsert({
                        id: data.user.id,
                        email: email,
                        first_name: firstName,
                        last_name: lastName,
                        phone: userData.phone || '',
                        role: role,
                        status: userStatus,
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'id' // Update if ID already exists
                    })
                    .select()
                    .single();

                if (insertError) {
                    // Check if it's an RLS error or something else
                    console.error('❌ signUp - Database upsert ERROR:', insertError.message, insertError.code);

                    // If the trigger already created it and RLS prevents update, we might get an error.
                    // However, we want the signup to be considered successful even if the profile 
                    // insertion has a minor hiccup, as long as the auth user was created.
                    // If the user already exists in public.users, we can proceed.
                } else {
                    console.log('✅ signUp - User profile synced/updated in database:', insertedData?.status);
                }
            }

            return { user: data.user, error: null };
        } catch (error) {
            return { user: null, error };
        }
    },

    // Sign in user
    async signIn(email, password) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            return { user: data.user, error };
        } catch (error) {
            return { user: null, error };
        }
    },

    // Sign out user
    async signOut() {
        try {
            const { error } = await supabase.auth.signOut();
            return { error };
        } catch (error) {
            return { error };
        }
    },

    // Get current user
    getCurrentUser() {
        return supabase.auth.currentUser;
    },

    // Create auth user (alias for signUp with specific return for compatibility)
    async createAuthUser(email, password, userData = {}) {
        try {
            const options = {};
            if (userData.role || userData.fullName) {
                options.data = {
                    role: userData.role,
                    full_name: userData.fullName
                };
            }

            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: options
            });
            return { uid: data?.user?.id, error };
        } catch (error) {
            return { uid: null, error };
        }
    },

    // Listen to auth state changes
    onAuthStateChanged(callback) {
        return supabase.auth.onAuthStateChange(callback);
    }
};

// Database helper functions
export const dbService = {
    // Get all bins
    async getBins() {
        try {
            const { data, error } = await supabase
                .from(TABLES.BINS)
                .select('*')
                .order('bin_id');

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error fetching bins:', error);
            return { data: null, error };
        }
    },

    // Get all users
    async getUsers() {
        try {
            const { data, error } = await supabase
                .from(TABLES.USERS)
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Convert snake_case to camelCase for JavaScript
            const convertedData = data?.map(user => {
                const firstName = user.first_name || '';
                const lastName = user.last_name || '';
                const fullName = `${firstName} ${lastName}`.trim() || user.email?.split('@')[0] || 'Unknown';

                return {
                    id: user.id,
                    firstName: firstName,
                    lastName: lastName,
                    fullName: fullName,
                    email: user.email,
                    phone: user.phone,
                    role: user.role,
                    status: user.status,
                    location: user.barangay,
                    photoUrl: user.photo_url,
                    createdAt: user.created_at,
                    updatedAt: user.updated_at
                };
            });

            return { data: convertedData, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Get user by ID
    async getUserById(id) {
        try {
            const { data, error } = await supabase
                .from(TABLES.USERS)
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            if (!data) return { data: null, error: null };

            const firstName = data.first_name || '';
            const lastName = data.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim() || data.email?.split('@')[0] || 'Unknown';

            const convertedData = {
                id: data.id,
                firstName: firstName,
                lastName: lastName,
                fullName: fullName,
                email: data.email,
                phone: data.phone,
                role: data.role,
                status: data.status,
                location: data.barangay,
                photoUrl: data.photo_url,
                createdAt: data.created_at,
                updatedAt: data.updated_at
            };

            return { data: convertedData, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Create new user
    async createUser(userData) {
        try {
            // Prepare data for database
            const dbData = {
                id: userData.id,
                email: userData.email,
                phone: userData.phone,
                role: userData.role,
                status: userData.status,
                first_name: userData.firstName || userData.fullName?.split(' ')[0] || '',
                last_name: userData.lastName || userData.fullName?.split(' ').slice(1).join(' ') || '',
                barangay: userData.location,
            };

            const { data, error } = await supabase
                .from(TABLES.USERS)
                .upsert({
                    ...dbData,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'id'
                })
                .select()
                .single();

            if (error) {
                console.error('createUser error:', error);
                throw error;
            }

            if (!data) return { data: null, error: null };

            const firstName = data.first_name || '';
            const lastName = data.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim();

            const convertedData = {
                id: data.id,
                firstName: firstName,
                lastName: lastName,
                fullName: fullName,
                email: data.email,
                phone: data.phone,
                role: data.role,
                status: data.status,
                location: data.barangay,
                createdAt: data.created_at,
                updatedAt: data.updated_at
            };

            return { data: convertedData, error: null };
        } catch (error) {
            console.error('createUser caught error:', error);
            return { data: null, error };
        }
    },

    // Update user
    async updateUser(id, updates) {
        try {
            // Prepare update data for database
            const dbUpdates = {};

            if (updates.firstName !== undefined) dbUpdates.first_name = updates.firstName;
            if (updates.lastName !== undefined) dbUpdates.last_name = updates.lastName;

            // Handle display_name if firstName or lastName is provided (for completeness, though we rely on first/last)
            // No, we don't have display_name column. Just update first/last.
            if (updates.fullName !== undefined) {
                const parts = updates.fullName.split(' ');
                dbUpdates.first_name = parts[0] || '';
                dbUpdates.last_name = parts.slice(1).join(' ') || '';
            }

            // Map other fields
            if (updates.email !== undefined) dbUpdates.email = updates.email;
            if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
            if (updates.role !== undefined) dbUpdates.role = updates.role;
            if (updates.status !== undefined) dbUpdates.status = updates.status;
            if (updates.photoUrl !== undefined) dbUpdates.photo_url = updates.photoUrl;
            if (updates.location !== undefined) dbUpdates.barangay = updates.location;

            const { data, error } = await supabase
                .from(TABLES.USERS)
                .update({
                    ...dbUpdates,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single();

            if (error) {
                console.error('updateUser error:', error);
                throw error;
            }

            if (!data) return { data: null, error: null };

            const firstName = data.first_name || '';
            const lastName = data.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim();

            const convertedData = {
                id: data.id,
                firstName: firstName,
                lastName: lastName,
                fullName: fullName,
                email: data.email,
                phone: data.phone,
                role: data.role,
                status: data.status,
                location: data.barangay,
                createdAt: data.created_at,
                updatedAt: data.updated_at
            };

            return { data: convertedData, error: null };
        } catch (error) {
            console.error('updateUser caught error:', error);
            return { data: null, error };
        }
    },

    // Delete user
    async deleteUser(id) {
        try {
            const { error } = await supabase
                .from(TABLES.USERS)
                .delete()
                .eq('id', id);

            return { error };
        } catch (error) {
            return { error };
        }
    },

    // Get user activities
    async getUserActivities(limitCount = 10) {
        try {
            const { data, error } = await supabase
                .from(TABLES.USER_ACTIVITIES)
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limitCount);

            if (error) throw error;

            // Map to camelCase if needed, but for now returning as is with check
            const mappedData = data?.map(activity => ({
                id: activity.id,
                userId: activity.user_id,
                activityType: activity.activity_type,
                description: activity.description,
                metadata: activity.metadata,
                createdAt: activity.created_at
            }));

            return { data: mappedData, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Add user activity
    async addActivity(activity) {
        try {
            const { data, error } = await supabase
                .from(TABLES.USER_ACTIVITIES)
                .insert({
                    user_id: activity.userId,
                    activity_type: activity.activityType || activity.type,
                    description: activity.description || activity.message,
                    metadata: activity.metadata,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Get all collectors (registered users)
    async getCollectors() {
        try {
            const { data, error } = await supabase
                .from(TABLES.REGISTERED_COLLECTORS)
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const convertedData = data?.map(collector => ({
                id: collector.id,
                userId: collector.user_id,
                collectorId: collector.collector_id,
                driverName: collector.driver_name,
                vehicleId: collector.vehicle_id,
                vehicleType: collector.vehicle_type,
                licensePlate: collector.license_plate,
                phone: collector.phone,
                status: collector.status,
                currentRoute: collector.current_route,
                progress: collector.progress,
                eta: collector.eta,
                createdAt: collector.created_at,
                updatedAt: collector.updated_at
            }));

            return { data: convertedData, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Get collector by ID
    async getCollectorById(id) {
        try {
            const { data, error } = await supabase
                .from(TABLES.REGISTERED_COLLECTORS)
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            if (!data) return { data: null, error: null };

            const convertedData = {
                id: data.id,
                userId: data.user_id,
                collectorId: data.collector_id,
                driverName: data.driver_name,
                vehicleId: data.vehicle_id,
                vehicleType: data.vehicle_type,
                licensePlate: data.license_plate,
                phone: data.phone,
                status: data.status,
                currentRoute: data.current_route,
                progress: data.progress,
                eta: data.eta,
                createdAt: data.created_at,
                updatedAt: data.updated_at
            };

            return { data: convertedData, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Create new collector
    async createCollector(collectorData) {
        try {
            const { data, error } = await supabase
                .from(TABLES.REGISTERED_COLLECTORS)
                .insert({
                    user_id: collectorData.driverUserId || collectorData.userId,
                    collector_id: collectorData.collectorId,
                    driver_name: collectorData.driverName,
                    vehicle_id: collectorData.vehicleId,
                    vehicle_type: collectorData.vehicleType,
                    license_plate: collectorData.licensePlate,
                    phone: collectorData.phone,
                    status: collectorData.status || 'available',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;

            if (!data) return { data: null, error: null };

            const convertedData = {
                id: data.id,
                userId: data.user_id,
                collectorId: data.collector_id,
                driverName: data.driver_name,
                vehicleId: data.vehicle_id,
                vehicleType: data.vehicle_type,
                licensePlate: data.license_plate,
                phone: data.phone,
                status: data.status,
                currentRoute: data.current_route,
                progress: data.progress,
                eta: data.eta,
                createdAt: data.created_at,
                updatedAt: data.updated_at
            };

            return { data: convertedData, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Update collector
    async updateCollector(id, updates) {
        try {
            const dbUpdates = {
                updated_at: new Date().toISOString()
            };

            if (updates.collectorId !== undefined) dbUpdates.collector_id = updates.collectorId;
            if (updates.driverName !== undefined) dbUpdates.driver_name = updates.driverName;
            if (updates.vehicleId !== undefined) dbUpdates.vehicle_id = updates.vehicleId;
            if (updates.vehicleType !== undefined) dbUpdates.vehicle_type = updates.vehicleType;
            if (updates.licensePlate !== undefined) dbUpdates.license_plate = updates.licensePlate;
            if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
            if (updates.status !== undefined) dbUpdates.status = updates.status;
            if (updates.currentRoute !== undefined) dbUpdates.current_route = updates.currentRoute;
            if (updates.progress !== undefined) dbUpdates.progress = updates.progress;
            if (updates.eta !== undefined) dbUpdates.eta = updates.eta;

            const { data, error } = await supabase
                .from(TABLES.REGISTERED_COLLECTORS)
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            if (!data) return { data: null, error: null };

            const convertedData = {
                id: data.id,
                userId: data.user_id,
                collectorId: data.collector_id,
                driverName: data.driver_name,
                vehicleId: data.vehicle_id,
                vehicleType: data.vehicle_type,
                licensePlate: data.license_plate,
                phone: data.phone,
                status: data.status,
                currentRoute: data.current_route,
                progress: data.progress,
                eta: data.eta,
                createdAt: data.created_at,
                updatedAt: data.updated_at
            };

            return { data: convertedData, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Delete collector
    async deleteCollector(id) {
        try {
            const { error } = await supabase
                .from(TABLES.REGISTERED_COLLECTORS)
                .delete()
                .eq('id', id);

            return { error };
        } catch (error) {
            return { error };
        }
    },

    // Get special collections
    async getSpecialCollections() {
        try {
            console.log('--- getSpecialCollections DEBUG ---');

            // Check session
            const { data: { session } } = await supabase.auth.getSession();
            const { data: { user } } = await supabase.auth.getUser();

            console.log('Supabase Auth Status:', {
                hasSession: !!session,
                userId: user ? user.id : 'None',
                userRole: user?.user_metadata?.role || 'None'
            });

            const { data, error } = await supabase
                .from(TABLES.SPECIAL_COLLECTIONS)
                .select('*')
                .order('created_at', { ascending: false });

            console.log('Supabase Query Result:', {
                dataLength: data ? data.length : 0,
                error: error,
                table: TABLES.SPECIAL_COLLECTIONS
            });

            if (data && data.length > 0) {
                console.log('First record sample:', data[0]);
            }

            if (error) {
                console.error('Supabase fetch error:', error);
                throw error;
            }

            if (!data || data.length === 0) {
                console.warn('No special collections returned. Check RLS policies if data exists.');
                return { data: [], error: null };
            }

            const mappedData = data.map(doc => {
                const metadata = doc.metadata || {};

                return {
                    id: doc.id,
                    residentName: doc.resident_name || 'Resident',
                    residentBarangay: doc.resident_barangay || 'N/A',
                    residentPurok: doc.resident_purok || 'N/A',
                    residentId: doc.resident_id, // Map synthetic resident_id
                    wasteType: doc.waste_type,
                    estimatedQuantity: doc.estimated_quantity,
                    pickupLocation: doc.pickup_location,
                    message: doc.message,
                    specialInstructions: doc.special_instructions || doc.message,
                    paymentReference: doc.payment_reference,
                    paymentAmount: doc.payment_amount,
                    status: doc.status,
                    scheduledDate: doc.scheduled_date,
                    scheduledTime: doc.scheduled_time || metadata.scheduledTime,
                    cancellationReason: doc.cancellation_reason,
                    createdAt: doc.created_at,
                    updatedAt: doc.updated_at
                };
            });
            return { data: mappedData, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Update special collection status/general update
    async updateSpecialCollection(id, updates) {
        try {
            const dbUpdates = {
                updated_at: new Date().toISOString()
            };

            if (updates.status) dbUpdates.status = updates.status;

            const { data, error } = await supabase
                .from(TABLES.SPECIAL_COLLECTIONS)
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            // 🔔 Send push notification if status changed to 'completed'
            if (updates.status === 'completed' && data && data.resident_id) {
                console.log('Sending completion notification to resident:', data.resident_id);
                
                // 1. In-app notification
                const { error: notifError } = await supabase
                    .from(TABLES.NOTIFICATIONS)
                    .insert({
                        title: "Collection Completed",
                        message: `Your special waste collection for ${data.waste_type} has been completed. Thank you!`,
                        user_id: data.resident_id,
                        barangay: 'targeted',
                        created_at: new Date().toISOString()
                    });

                if (notifError) console.error('Notification error:', notifError);

                // 2. Push notification
                try {
                    const SUPABASE_URL = 'https://bfqktqtsjchbmopafgzf.supabase.co';
                    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcWt0cXRzamNoYm1vcGFmZ3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDgwMTIsImV4cCI6MjA4NTc4NDAxMn0.Xu7Ncwr5bWYF8x2t5h7XHw_nPrjlTSkQEdnQB4OtcNo';
                    fetch(`${SUPABASE_URL}/functions/v1/send-push-v2`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        },
                        body: JSON.stringify({
                            resident_id: data.resident_id,
                            title: 'Collection Completed ✅',
                            body: `Your waste collection for ${data.waste_type} has been successfully completed.`,
                        }),
                    });
                } catch (pushErr) {
                    console.error('💥 Completion push error:', pushErr);
                }
            }

            // 🔔 Send push notification if status changed to 'cancelled' (Admin action)
            if (updates.status === 'cancelled' && data && data.resident_id) {
                console.log('Sending cancellation notification to resident and collectors:', data.resident_id);
                
                // 1. Notify Resident (In-app)
                const { error: notifError } = await supabase
                    .from(TABLES.NOTIFICATIONS)
                    .insert({
                        title: "Collection Cancelled",
                        message: `Your special waste collection for ${data.waste_type} was cancelled by admin.`,
                        user_id: data.resident_id,
                        barangay: 'targeted',
                        created_at: new Date().toISOString()
                    });

                if (notifError) console.error('Notification error:', notifError);

                // 2. Notify Resident (Push)
                try {
                    const SUPABASE_URL = 'https://bfqktqtsjchbmopafgzf.supabase.co';
                    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcWt0cXRzamNoYm1vcGFmZ3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDgwMTIsImV4cCI6MjA4NTc4NDAxMn0.Xu7Ncwr5bWYF8x2t5h7XHw_nPrjlTSkQEdnQB4OtcNo';
                    fetch(`${SUPABASE_URL}/functions/v1/send-push-v2`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        },
                        body: JSON.stringify({
                            resident_id: data.resident_id,
                            title: 'Collection Cancelled ❌',
                            body: `Your waste collection for ${data.waste_type} was cancelled by admin.`,
                        }),
                    });
                } catch (pushErr) {
                    console.error('💥 Cancellation push error:', pushErr);
                }

                // 🚛 3. Notify ALL Collectors
                try {
                    const { data: collectors } = await supabase
                        .from('users')
                        .select('id')
                        .eq('role', 'collector');
                    
                    if (collectors && collectors.length > 0) {
                        // 3.1 Insert DB notifications for collectors
                        const collectorNotifications = collectors.map(c => ({
                            title: "🚨 Collection Cancelled",
                            message: `Scheduled pickup for ${data.resident_name} (${data.waste_type}) has been cancelled by admin.`,
                            user_id: c.id,
                            type: "alert",
                            barangay: `collector_${data.resident_barangay}`,
                            created_at: new Date().toISOString()
                        }));
                        
                        await supabase.from(TABLES.NOTIFICATIONS).insert(collectorNotifications);

                        // 3.2 Send Push Notifications to collectors
                        const SUPABASE_URL = 'https://bfqktqtsjchbmopafgzf.supabase.co';
                        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcWt0cXRzamNoYm1vcGFmZ3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDgwMTIsImV4cCI6MjA4NTc4NDAxMn0.Xu7Ncwr5bWYF8x2t5h7XHw_nPrjlTSkQEdnQB4OtcNo';
                        
                        for (const c of collectors) {
                            fetch(`${SUPABASE_URL}/functions/v1/send-push-v2`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                                },
                                body: JSON.stringify({
                                    resident_id: c.id,
                                    title: 'Scheduled Collection Cancelled 🚨',
                                    body: `Pickup for ${data.resident_name} has been cancelled by admin.`,
                                }),
                            }).catch(e => console.error('Collector cancellation push err:', e));
                        }
                    }
                } catch (collectorErr) {
                    console.error('Error notifying collectors of cancellation:', collectorErr);
                }
            }

            return { error: null };
        } catch (error) {
            return { error };
        }
    },

    // Approve special collection
    async approveSpecialCollection(id) {
        try {
            const { data, error } = await supabase
                .from('special_collections')
                .update({
                    status: 'approved',
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single();

            if (error) {
                console.error("Supabase update error:", error);
                return { error };
            }

            console.log("Approved collection:", data);

            // 🔔 Send targeted notification to the Resident
            if (data && data.resident_id) {
                console.log('Sending approval notification to resident:', data.resident_id);
                const { error: notifError } = await supabase
                    .from(TABLES.NOTIFICATIONS)
                    .insert({
                        title: "Request Approved",
                        message: `Your special collection request for ${data.waste_type} has been approved.`,
                        user_id: data.resident_id, // TARGETED ID
                        barangay: 'targeted',
                        created_at: new Date().toISOString()
                    });

                if (notifError) console.error('Notification error:', notifError);

                // 🚀 Send FCM push notification via Supabase Edge Function
                try {
                    const SUPABASE_URL = 'https://bfqktqtsjchbmopafgzf.supabase.co';
                    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcWt0cXRzamNoYm1vcGFmZ3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDgwMTIsImV4cCI6MjA4NTc4NDAxMn0.Xu7Ncwr5bWYF8x2t5h7XHw_nPrjlTSkQEdnQB4OtcNo';
                    
                    await fetch(`${SUPABASE_URL}/functions/v1/send-push-v2`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        },
                        body: JSON.stringify({
                            resident_id: data.resident_id,
                            title: 'Request Approved ✅',
                            body: `Your special collection request for ${data.waste_type} has been approved. Please proceed to the cashier for payment.`,
                        }),
                    });

                    if (!pushResponse.ok) {
                        const errorText = await pushResponse.text();
                        console.error('❌ Edge Function Error Status:', pushResponse.status);
                        console.error('❌ Edge Function Error Body:', errorText);
                        
                        // Try to parse as JSON if possible, otherwise use text
                        let errorDetail;
                        try {
                            errorDetail = JSON.parse(errorText);
                        } catch (e) {
                            errorDetail = errorText;
                        }
                        console.warn('⚠️ FCM push failed accurately:', errorDetail);
                    } else {
                        const pushResult = await pushResponse.json();
                        console.log('📲 FCM push result:', pushResult);
                    }
                } catch (pushErr) {
                    console.error('💥 Critical FCM error:', pushErr);
                }
            }

            return { data, error: null };

        } catch (err) {
            console.error("Approve function failed:", err);
            return { error: err };
        }
    },

    // Verify payment
    async verifySpecialCollectionPayment(id, amount, verifiedBy, paymentReference) {
        try {
            const updates = {
                status: 'verified',
                payment_amount: amount,
                updated_at: new Date().toISOString()
            };

            if (paymentReference) {
                updates.payment_reference = paymentReference;
            }

            const { error } = await supabase
                .from(TABLES.SPECIAL_COLLECTIONS)
                .update(updates)
                .eq('id', id);

            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error };
        }
    },

    // Schedule collection
    // Schedule collection
    // Schedule collection + send notification
    async scheduleSpecialCollection(id, date, time) {
        try {
            const { data, error } = await supabase
                .from(TABLES.SPECIAL_COLLECTIONS)
                .update({
                    status: 'scheduled',
                    scheduled_date: date,
                    scheduled_time: time,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single();

            console.log('Successfully scheduled collection:', data);

            // 🔔 Send targeted notification to the Resident
                    if (data && data.resident_id) {
                console.log('Sending targeted notification to resident:', data.resident_id);

                // Create a local display string (Explicitly Asia/Manila)
                const displayDateTime = new Date(`${date} ${time}`).toLocaleString('en-US', {
                    timeZone: 'Asia/Manila',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });

                const { error: notifError } = await supabase
                    .from(TABLES.NOTIFICATIONS)
                    .insert({
                        title: "Collection Scheduled ✅",
                        message: `Your waste collection for ${data.waste_type} has been scheduled for ${displayDateTime}.`,
                        user_id: data.resident_id, // TARGETED ID
                        barangay: 'targeted', // Use internal tag
                        type: 'schedule_update',
                        created_at: new Date().toISOString()
                    });

                if (notifError) console.error('Notification error:', notifError);

                // 🚀 Send FCM push notification via Supabase Edge Function
                try {
                    const SUPABASE_URL = 'https://bfqktqtsjchbmopafgzf.supabase.co';
                    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcWt0cXRzamNoYm1vcGFmZ3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDgwMTIsImV4cCI6MjA4NTc4NDAxMn0.Xu7Ncwr5bWYF8x2t5h7XHw_nPrjlTSkQEdnQB4OtcNo';
                    fetch(`${SUPABASE_URL}/functions/v1/send-push-v2`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        },
                        body: JSON.stringify({
                            resident_id: data.resident_id,
                            title: 'Collection Scheduled 🚚',
                            body: `Your waste collection for ${data.waste_type} has been scheduled for ${displayDateTime}.`,
                        }),
                    }).catch(pushErr => console.error('💥 Scheduling push error:', pushErr));
                } catch (pushErr) {
                    console.error('💥 Scheduling push error:', pushErr);
                }
            }

            // 🚛 Add to Collector's Schedules (collection_schedules table)
            if (data) {
                try {
                    // Convert date & time to a full ISO string for the scheduled_date field
                    // date format is usually YYYY-MM-DD, time is HH:MM am/pm or HH:MM
                    // Just storing date + 'T' + time works if it parses
                    const dateTimeStr = new Date(`${date} ${time}`);
                    let isoScheduledDate = new Date().toISOString();
                    if (!isNaN(dateTimeStr.getTime())) {
                        isoScheduledDate = dateTimeStr.toISOString();
                    }

                    const { error: scheduleError } = await supabase
                        .from(TABLES.COLLECTION_SCHEDULES || 'collection_schedules')
                        .insert({
                            zone: data.resident_barangay || 'Unknown Area',
                            name: `Special Collection: ${data.waste_type || 'Waste'}`,
                            description: `Location: ${data.pickup_location || 'N/A'}, Resident: ${data.resident_name || 'N/A'}`,
                            status: 'Scheduled',
                            scheduled_date: isoScheduledDate,
                            collection_time: isoScheduledDate, // Added to fix NULL constraint
                            updated_at: new Date().toISOString()
                        });

                    if (scheduleError) {
                        console.error('Error adding to collection_schedules:', scheduleError);
                    } else {
                        // Notify all collectors about this new special collection
                        try {
                            // 1. Get collectors from 'users' table (by role)
                            const { data: usersWithRole } = await supabase
                                .from('users')
                                .select('id')
                                .or('role.eq.collector,role.eq.Collector');
                            
                            // 2. Get collectors from 'registered_collectors' table
                            const { data: registeredCollectors } = await supabase
                                .from('registered_collectors')
                                .select('user_id');

                            // 3. Deduplicate IDs using a Set
                            const allCollectorIds = new Set([
                                ...(usersWithRole || []).map(u => u.id),
                                ...(registeredCollectors || []).map(c => c.user_id)
                            ]);
                            
                            if (allCollectorIds.size > 0) {
                                console.log(`Found ${allCollectorIds.size} unique Collectors to notify:`, Array.from(allCollectorIds));
                                
                                // Create a local display string (Explicitly Asia/Manila)
                                const displayDateTime = new Date(`${date} ${time}`).toLocaleString('en-US', {
                                    timeZone: 'Asia/Manila',
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                });

                                // 4. Insert DB notifications for in-app alerts
                                const notificationsList = Array.from(allCollectorIds).map(id => ({
                                    title: "🚨 New Special Collection",
                                    message: `New collection for ${data.waste_type} on ${displayDateTime}.`,
                                    user_id: id,
                                    type: "alert",
                                    barangay: `collector_${data.resident_barangay}`,
                                    created_at: new Date().toISOString()
                                }));
                                
                                await supabase.from(TABLES.NOTIFICATIONS).insert(notificationsList);

                                // 5. Send actual Push Notifications to Collectors via Edge Function
                                const pushPromises = Array.from(allCollectorIds).map(id => {
                                    if (!id) return Promise.resolve();
                                    return supabase.functions.invoke('send-push-v2', {
                                        headers: {
                                            'apikey': SUPABASE_ANON_KEY
                                        },
                                        body: {
                                            resident_id: id, 
                                            title: 'New Special Collection 🚨',
                                            body: `New collection for ${data.waste_type} scheduled for ${displayDateTime}.`,
                                        }
                                    }).then(({ data: resData, error: pushErr }) => {
                                        if (pushErr) console.error(`Collector ${id} push error:`, pushErr);
                                        else console.log(`Collector ${id} Push Result:`, resData);
                                    }).catch(err => console.error(`Collector ${id} push async error:`, err));
                                });
                                
                                await Promise.all(pushPromises);
                                console.log('✅ All collector push notifications completed.');
                            } else {
                                console.warn('⚠️ No collectors found in users or registered_collectors tables.');
                            }
                        } catch (collectorNotifErr) {
                            console.error('Error notifying collectors:', collectorNotifErr);
                        }
                    }
                } catch (err) {
                    console.error('Error in creating collector schedule for special pickup:', err);
                }
            }

            return { data, error: null };
        } catch (error) {
            console.error("Schedule error:", error);
            return { error };
        }
    },
    // Get area schedules (fixed weekly)
    async getAreaSchedules() {
        try {
            const { data, error } = await supabase
                .from(TABLES.AREA_SCHEDULES || 'area_schedules')
                .select('*')
                .order('area', { ascending: true });

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Create area schedule (fixed recurring)
    async createAreaSchedule(payload) {
        try {
            const { data, error } = await supabase
                .from(TABLES.AREA_SCHEDULES)
                .insert({
                    area: payload.area.toLowerCase(),
                    schedule_name: payload.scheduleName || `${payload.area} Waste Collection`,
                    days: payload.days,
                    time: payload.time || '08:00:00',
                    is_active: payload.isActive !== undefined ? payload.isActive : true,
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error creating area schedule:', error);
            return { data: null, error };
        }
    },

    // Update area schedule
    async updateAreaSchedule(id, updates) {
        try {
            const dbUpdates = {
                updated_at: new Date().toISOString()
            };

            if (updates.area) dbUpdates.area = updates.area.toLowerCase();
            if (updates.scheduleName) dbUpdates.schedule_name = updates.scheduleName;
            if (updates.days) dbUpdates.days = updates.days;
            if (updates.time) dbUpdates.time = updates.time;
            if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

            const { data, error } = await supabase
                .from(TABLES.AREA_SCHEDULES)
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error updating area schedule:', error);
            return { data: null, error };
        }
    },

    // Delete area schedule
    async deleteAreaSchedule(id) {
        try {
            const { error } = await supabase
                .from(TABLES.AREA_SCHEDULES)
                .delete()
                .eq('id', id);

            if (error) throw error;
            return { error: null };
        } catch (error) {
            console.error('Error deleting area schedule:', error);
            return { error };
        }
    },

    // Get bins/sensors
    async getBins() {
        try {
            const { data, error } = await supabase
                .from(TABLES.BINS || 'bins')
                .select('*')
                .order('bin_id', { ascending: true });

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Get collection schedules (manual overrides/instances)
    async getCollectionSchedules() {
        try {
            const { data, error } = await supabase
                .from(TABLES.COLLECTION_SCHEDULES)
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const mappedData = data?.map(doc => ({
                id: String(doc.id || `req_${Date.now()}`),
                name: doc.name || doc.description || 'Eco Collection',
                area: doc.address || doc.area || 'Unknown Area',
                serviceArea: doc.zone,
                status: doc.status || 'pending',
                scheduledDate: doc.scheduled_date || doc.created_at,
                isRescheduled: doc.is_rescheduled,
                originalDate: doc.original_date,
                rescheduledReason: doc.rescheduled_reason,
                createdAt: doc.created_at
            }));

            return { data: mappedData, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Create collection schedule
    async createCollectionSchedule(payload) {
        try {
            const dbPayload = {
                zone: payload.area || payload.serviceArea,
                name: payload.name || payload.description || 'Eco Collection',
                description: payload.description || payload.name || '',
                status: payload.status || 'scheduled',
                scheduled_date: payload.scheduledDate instanceof Date ? payload.scheduledDate.toISOString() : payload.scheduledDate,
                is_rescheduled: payload.isRescheduled || false,
                original_date: payload.originalDate instanceof Date ? payload.originalDate.toISOString() : payload.originalDate,
                rescheduled_reason: payload.rescheduledReason || '',
                updated_at: new Date().toISOString()
            };

            const { data, error } = await supabase
                .from(TABLES.COLLECTION_SCHEDULES)
                .insert(dbPayload)
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Update collection schedule
    async updateCollectionSchedule(id, updates) {
        try {
            const dbUpdates = {
                updated_at: new Date().toISOString()
            };

            if (updates.area || updates.serviceArea) dbUpdates.zone = updates.area || updates.serviceArea;
            if (updates.name) dbUpdates.name = updates.name;
            if (updates.description) dbUpdates.description = updates.description;
            if (updates.status) dbUpdates.status = updates.status;
            if (updates.scheduledDate) dbUpdates.scheduled_date = updates.scheduledDate instanceof Date ? updates.scheduledDate.toISOString() : updates.scheduledDate;
            if (updates.isRescheduled !== undefined) dbUpdates.is_rescheduled = updates.isRescheduled;
            if (updates.originalDate) dbUpdates.original_date = updates.originalDate instanceof Date ? updates.originalDate.toISOString() : updates.originalDate;
            if (updates.rescheduledReason) dbUpdates.rescheduled_reason = updates.rescheduledReason;

            const { data, error } = await supabase
                .from(TABLES.COLLECTION_SCHEDULES)
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Delete collection schedule
    async deleteCollectionSchedule(id) {
        try {
            const { error } = await supabase
                .from(TABLES.COLLECTION_SCHEDULES)
                .delete()
                .eq('id', id);

            if (error) throw error;
            return { error: null };
        } catch (error) {
            return { error };
        }
    },

    // Get resident feedback
    async getResidentFeedback(limitCount = 50) {
        try {
            const { data, error } = await supabase
                .from(TABLES.RESIDENT_FEEDBACK)
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limitCount);

            if (error) throw error;

            return { data: mapFeedbackData(data), error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Get generic notifications
    async getGenericNotifications(limitCount = 50) {
        try {
            const { data, error } = await supabase
                .from(TABLES.NOTIFICATIONS)
                .select('*')
                // Removed .eq('user_id', user.id) due to user_id being dropped for anonymity
                .order('created_at', { ascending: false })
                .limit(limitCount);

            if (error) throw error;

            const mappedData = data?.map(doc => ({
                id: doc.id,
                title: doc.title,
                message: doc.message,
                type: doc.type || 'info',
                priority: doc.priority || 'medium',
                createdAt: doc.created_at,
                read: doc.is_read || doc.read || false
            }));

            return { data: mappedData, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },
    // Create notification
    async createNotification(notificationData) {
        try {
            const { data, error } = await supabase
                .from(TABLES.NOTIFICATIONS)
                .insert({
                    // user_id removed for anonymity; use barangay for targeting
                    barangay: notificationData.barangay || 'All',
                    title: notificationData.title,
                    message: notificationData.message,
                    type: notificationData.type || 'info',
                    priority: notificationData.priority || 'medium',
                    is_read: false,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },


    // Update notification
    async updateNotification(id, updates) {
        try {
            // Support both 'is_read' (DB) and 'read' (JS fallback)
            const dbUpdates = { ...updates };
            if (updates.read !== undefined) {
                dbUpdates.is_read = updates.read;
                delete dbUpdates.read;
            }

            const { data, error } = await supabase
                .from(TABLES.NOTIFICATIONS)
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Delete notification
    async deleteNotification(id) {
        try {
            const { error } = await supabase
                .from(TABLES.NOTIFICATIONS)
                .delete()
                .eq('id', id);

            if (error) throw error;
            return { success: true, error: null };
        } catch (error) {
            return { success: false, error };
        }
    },

    // Get community notifications (announcements)
    async getCommunityNotifications(limitCount = 50) {
        try {
            const { data, error } = await supabase
                .from(TABLES.ANNOUNCEMENTS)
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limitCount);

            if (error) throw error;

            const mappedData = data?.map(doc => ({
                id: doc.id,
                title: doc.title,
                message: doc.content,
                type: 'system',
                priority: 'medium',
                createdAt: doc.created_at,
                read: doc.read || false
            }));

            return { data: mappedData, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Create announcement (Community Notification)
    async createAnnouncement(announcementData) {
        try {
            const { data, error } = await supabase
                .from(TABLES.ANNOUNCEMENTS)
                .insert({
                    title: announcementData.title,
                    content: announcementData.content || announcementData.message,
                    target_audience: announcementData.targetAudience || 'all',
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    },

    // Get bins (IoT sensors)
    async getBins() {
        try {
            const { data, error } = await supabase
                .from(TABLES.BINS)
                .select('*')
                .order('fill_level', { ascending: false });

            if (error) throw error;

            const mappedData = data?.map(bin => ({
                id: bin.id,
                bin_id: bin.bin_id || bin.id,
                address: bin.location || bin.address || 'Unknown Location',
                zone: bin.zone || 'General',
                fill_level: bin.fill_level || 0,
                status: bin.status || 'active',
                last_emptied: bin.last_emptied,
                updated_at: bin.updated_at,
                // Telemetry fields
                distance: bin.distance || 0,
                gps_lat: bin.gps_lat,
                gps_lng: bin.gps_lng,
                gps_status: bin.gps_status || 'Unknown',
                gps_processed: bin.gps_processed || 0,
                gps_sentences: bin.gps_sentences || 0,
                gps_error: bin.gps_error || '',
                // Location data for maps
                location_lat: bin.location_lat || bin.gps_lat,
                location_lng: bin.location_lng || bin.gps_lng
            })) || [];

            return { data: mappedData, error: null };
        } catch (error) {
            console.error('getBins error:', error);
            return { data: [], error };
        }
    },

    // Get routes (for compatibility, returning empty if table doesn't exist or feature removed)
    async getRoutes() {
        try {
            // Check if we have a table for routes, otherwise return empty
            // Assuming 'waste_routes' table might exist or we just return empty list
            // as the feature was noted as removed in some parts of the dashboard.
            return { data: [], error: null };
        } catch (error) {
            return { data: [], error };
        }
    },

    // Get system statistics
    async getSystemStats() {
        try {
            // Fetch users, collectors, bins, and areas in parallel
            // Use allSettled so one failure doesn't break everything
            const results = await Promise.allSettled([
                supabase.from(TABLES.USERS).select('id, role, status, created_at'),
                supabase.from(TABLES.REGISTERED_COLLECTORS).select('id, status'),
                supabase.from(TABLES.BINS || 'bins').select('id'),
                supabase.from(TABLES.AREA_SCHEDULES || 'area_schedules').select('id')
            ]);

            const extract = (result, label) => {
                if (result.status === 'rejected') {
                    console.warn(`getSystemStats: ${label} query rejected:`, result.reason?.message || result.reason);
                    return [];
                }
                const { data, error } = result.value;
                if (error) {
                    console.warn(`getSystemStats: ${label} query error:`, error.message || error);
                    return [];
                }
                return data || [];
            };

            const userList = extract(results[0], 'users');
            const collectorList = extract(results[1], 'registered_collectors');
            const binList = extract(results[2], 'bins');
            const areaList = extract(results[3], 'area_schedules');

            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            const stats = {
                totalUsers: userList.length,
                activeUsers: userList.filter(u => u.status === 'active').length,
                adminUsers: userList.filter(u => u.role === 'admin' || u.role === 'superadmin').length,
                supervisorUsers: userList.filter(u => u.role === 'supervisor').length,
                residentUsers: userList.filter(u => u.role === 'resident').length,
                victoriaResidents: userList.filter(u => u.role === 'resident' && (u.barangay === 'Victoria')).length,
                dayoanResidents: userList.filter(u => u.role === 'resident' && (u.barangay === 'Dayo-An' || u.barangay === 'Dayo-an')).length,

                totalCollectors: Math.max(
                    userList.filter(u => u.role === 'collector').length,
                    collectorList.length
                ),
                activeCollectors: collectorList.filter(c => c.status === 'active' || c.status === 'available').length ||
                    userList.filter(u => u.role === 'collector' && u.status === 'active').length,

                iotUsers: binList.length,
                serviceAreas: areaList,

                newUsersThisMonth: userList.filter(u => {
                    if (!u.created_at) return false;
                    const created = new Date(u.created_at);
                    return created.getMonth() === currentMonth &&
                        created.getFullYear() === currentYear;
                }).length
            };

            return { data: stats, error: null };
        } catch (error) {
            console.error('getSystemStats error:', error?.message || error);
            return { data: null, error };
        }
    }

};

// Realtime Event Listeners
export const realtime = {
    // Subscribe to user changes
    subscribeToUsers(callback) {
        return supabase
            .channel('users-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.USERS },
                (payload) => {
                    // Refetch users when changes occur
                    dbService.getUsers().then(({ data }) => {
                        if (data) callback(data);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to activities
    subscribeToActivities(callback, limitCount = 10) {
        return supabase
            .channel('activities-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.USER_ACTIVITIES },
                (payload) => {
                    // Refetch activities when changes occur
                    dbService.getUserActivities(limitCount).then(({ data }) => {
                        if (data) callback(data);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to system stats
    subscribeToStats(callback) {
        return supabase
            .channel('stats-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.USERS },
                (payload) => {
                    // Refetch stats when users change
                    dbService.getSystemStats().then(({ data }) => {
                        if (data) callback(data);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to collectors
    subscribeToCollectors(callback) {
        return supabase
            .channel('collectors-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.REGISTERED_COLLECTORS },
                (payload) => {
                    // Refetch collectors when changes occur
                    dbService.getCollectors().then(({ data }) => {
                        if (data) callback(data, payload);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to resident feedback
    subscribeToResidentFeedback(callback) {
        return supabase
            .channel('feedback-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.RESIDENT_FEEDBACK },
                (payload) => {
                    dbService.getResidentFeedback(50).then(({ data }) => {
                        if (data) callback(data, payload);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to community notifications (announcements)
    subscribeToCommunityNotifications(callback) {
        return supabase
            .channel('announcements-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.ANNOUNCEMENTS },
                (payload) => {
                    dbService.getCommunityNotifications(50).then(({ data }) => {
                        if (data) callback(data, payload);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to generic notifications
    subscribeToGenericNotifications(callback) {
        return supabase
            .channel('notifications-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.NOTIFICATIONS },
                (payload) => {
                    dbService.getGenericNotifications(50).then(({ data }) => {
                        if (data) callback(data, payload);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to collection schedules
    subscribeToCollectionSchedules(callback) {
        return supabase
            .channel('schedules-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.COLLECTION_SCHEDULES },
                (payload) => {
                    dbService.getCollectionSchedules().then(({ data }) => {
                        if (data) callback(data);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to area schedules
    subscribeToAreaSchedules(callback) {
        return supabase
            .channel('area-schedules-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.AREA_SCHEDULES || 'area_schedules' },
                (payload) => {
                    dbService.getAreaSchedules().then(({ data }) => {
                        if (data) callback(data);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to bins (IoT sensors)
    subscribeToBins(callback) {
        return supabase
            .channel('bins-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.BINS || 'bins' },
                (payload) => {
                    dbService.getBins().then(({ data }) => {
                        if (data) callback(data, payload);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to Special Collections
    subscribeToSpecialCollections(callback) {
        return supabase
            .channel('special-collections-changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.SPECIAL_COLLECTIONS },
                (payload) => {
                    // Refetch when changes occur
                    dbService.getSpecialCollections().then(({ data }) => {
                        if (data) callback(data, payload);
                    });
                }
            )
            .subscribe();
    }
};

// Helper to map feedback data
function mapFeedbackData(data) {
    return data?.map(doc => ({
        id: doc.id,
        userId: doc.user_id,
        message: doc.feedback_text,
        rating: doc.rating,
        createdAt: doc.created_at,
        title: 'Resident Feedback',
        type: 'feedback',
        priority: doc.rating >= 4 ? 'high' : 'medium',
        read: doc.read || false,
        barangay: doc.barangay || '',
        purok: doc.purok || '',
        residentName: doc.resident_name || 'Resident',
        category: doc.category || 'General'
    })) || [];
}

// Utility functions
export const utils = {
    // Format date
    formatDate(date) {
        if (!date) return 'N/A';

        const dateObj = date instanceof Date ? date : new Date(date);
        return dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Get relative time
    getRelativeTime(date) {
        if (!date) return 'N/A';

        const now = new Date();
        const past = date instanceof Date ? date : new Date(date);
        const diffInSeconds = Math.floor((now - past) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
        if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;

        return utils.formatDate(date);
    },

    // Generate user avatar
    generateAvatar(name) {
        if (!name) return 'U';
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase();
        return initials;
    },

    // Show toast notification
    showNotification(message, type = 'info') {
        const getIcon = (t) => {
            const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', info: 'info-circle' };
            return icons[t] || 'info-circle';
        };
        const getColor = (t) => {
            const colors = { success: '#059669', error: '#dc2626', warning: '#d97706', info: '#2563eb' };
            return colors[t] || '#2563eb';
        };

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            background: ${getColor(type)}; color: white;
            padding: 12px 24px; border-radius: 8px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            z-index: 9999; display: flex; align-items: center; gap: 10px;
            animation: slideIn 0.3s ease-out; font-family: 'Inter', sans-serif;
        `;
        notification.innerHTML = `<i class="fas fa-${getIcon(type)}"></i><span>${message}</span>`;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => {
                if (notification.parentNode) notification.remove();
            }, 300);
        }, 3000);
    },

    // Handle Supabase errors
    getErrorMessage(error) {
        if (error?.message) {
            if (error.message.includes('User already registered')) {
                return 'This email is already registered.';
            }
            if (error.message.includes('Password should be')) {
                return 'Password should be at least 6 characters.';
            }
            if (error.message.includes('Invalid login credentials')) {
                return 'Invalid email or password.';
            }
            return error.message;
        }
        return 'An error occurred.';
    }
};

export default { supabase, authService, dbService, realtime, utils };
