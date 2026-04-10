// Supabase Configuration
console.log("%c🚀 DISK UPDATE VERIFIED: supabase_config.js loaded (SOURCE)", "color: white; background: blue; padding: 10px; font-size: 20px;");
// Using CDN version for browser compatibility
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Your Supabase project URL and anon key
export const SUPABASE_URL = 'https://bfqktqtsjchbmopafgzf.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcWt0cXRzamNoYm1vcGFmZ3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDgwMTIsImV4cCI6MjA4NTc4NDAxMn0.Xu7Ncwr5bWYF8x2t5h7XHw_nPrjlTSkQEdnQB4OtcNo';

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
                    purok: user.purok,
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
                purok: data.purok,
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
                purok: userData.purok,
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
                purok: data.purok,
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
            if (updates.purok !== undefined) dbUpdates.purok = updates.purok;

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
                purok: data.purok,
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
                    residentBarangay: doc.resident_barangay || '',
                    residentPurok: doc.resident_purok || '',
                    residentId: doc.resident_id,
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
                    metadata: metadata, // Ensure metadata is passed to the UI
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
                        title: "Collection Completed | Human na ang pagkolekta",
                        message: `Your special waste collection for ${data.waste_type} has been completed. Thank you! \n\n Human na ang pagkolekta sa imong basura para sa ${data.waste_type}. Salamat!`,
                        user_id: data.resident_id,
                        barangay: 'targeted',
                        created_at: new Date().toISOString()
                    });

                if (notifError) console.error('Notification error:', notifError);

            // 🔔 DB TRIGGER HANDLES PUSH: The new database trigger on user_notifications 
            // will automatically call send-push-v2 for residents and collectors.
            // No manual fetch(push) remains in this clean version.
            }

            // 🔔 Send push notification if status changed to 'cancelled' (Admin action)
            if (updates.status === 'cancelled' && data && data.resident_id) {
                console.log('Sending cancellation notification to resident and collectors:', data.resident_id);
                
                // 1. Notify Resident (In-app)
                const { error: notifError } = await supabase
                    .from(TABLES.NOTIFICATIONS)
                    .insert({
                        title: "Collection Cancelled | Gikanselar ang pagkolekta",
                        message: `Your special waste collection for ${data.waste_type} was cancelled by admin. \n\n Ang imong hangyo sa pagkolekta sa ${data.waste_type} gikanselar sa admin.`,
                        user_id: data.resident_id,
                        barangay: 'targeted',
                        created_at: new Date().toISOString()
                    });

                if (notifError) console.error('Notification error:', notifError);

                // 2. Notify Resident (Push)
                try {
                    const { data: pushData, error: pushErr } = await supabase.functions.invoke('send-push-v2', {
                        headers: {
                            'apikey': SUPABASE_ANON_KEY
                        },
                        body: {
                            resident_id: data.resident_id,
                            title: 'Collection Cancelled | Gikanselar ❌',
                            body: `Your waste collection for ${data.waste_type} was cancelled by admin. \n\n Ang imong hangyo sa pagkolekta sa ${data.waste_type} gikanselar sa admin.`,
                        }
                    });
                    if (pushErr) console.error('💥 Cancellation push error:', pushErr);
                } catch (err) {
                    console.error('💥 Critical cancellation error:', err);
                }
 
                // 🚛 3. Notify ALL Collectors (Push Only)
                try {
                    // Check both tables for collectors
                    const { data: usersWithRole } = await supabase
                        .from('users')
                        .select('id')
                        .or('role.eq.collector,role.eq.Collector');
                    
                    const { data: registeredCollectors } = await supabase
                        .from('registered_collectors')
                        .select('user_id');
 
                    const allCollectorIds = new Set([
                        ...(usersWithRole || []).map(u => u.id),
                        ...(registeredCollectors || []).map(c => c.user_id)
                    ]);
                    
                    if (allCollectorIds.size > 0) {
                        const title = "🚨 Collection Cancelled | Gikanselar ang pagkolekta";
                        const body = `Scheduled pickup for ${data.resident_name || 'Resident'} (${data.waste_type || 'General Waste'}) has been cancelled by admin. \n\n Kanselado na ang schedule para kay ${data.resident_name || 'Resident'} (${data.waste_type || 'General Waste'}).`;
                        
                        // Notify each collector via Edge Function
                        for (const id of Array.from(allCollectorIds)) {
                            if (!id) continue;
                            
                            supabase.functions.invoke('send-push-v2', {
                                headers: { 'apikey': SUPABASE_ANON_KEY },
                                body: { resident_id: id, title, body }
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
                        title: "Request Approved | Gi-aprubahan ang hangyo",
                        message: `Your special collection request for ${data.waste_type} has been approved. Please proceed to the cashier for payment. \n\n Gi-aprubahan na ang imong hangyo sa pagkolekta sa ${data.waste_type}. Palihog bayad na sa cashier.`,
                        user_id: data.resident_id, // TARGETED ID
                        barangay: 'targeted',
                        created_at: new Date().toISOString()
                    });

                if (notifError) console.error('Notification error:', notifError);

                // 🚀 Send FCM push notification via Supabase Edge Function
                try {
                    const { data: pushData, error: pushErr } = await supabase.functions.invoke('send-push-v2', {
                        headers: {
                            'apikey': SUPABASE_ANON_KEY
                        },
                        body: {
                            resident_id: data.resident_id,
                            title: 'Request Approved | Gi-aprubahan ✅',
                            body: `Your special collection request for ${data.waste_type} has been approved. Please proceed to the cashier for payment. \n\n Gi-aprubahan na ang imong hangyo sa pagkolekta sa ${data.waste_type}. Palihog bayad na.`,
                        }
                    });

                    if (pushErr) {
                        console.warn('⚠️ FCM push failed accurately:', pushErr);
                    } else {
                        console.log('📲 FCM push result:', pushData);
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
            // Fetch existing record first to get metadata
            const { data: existing, error: fetchError } = await supabase
                .from(TABLES.SPECIAL_COLLECTIONS)
                .select('*')
                .eq('id', id)
                .single();

            if (fetchError) throw fetchError;

            const metadata = existing.metadata || {};
            // Preserve existing metadata (like residentAge, residentStreet) and add/update scheduledTime
            const updatedMetadata = {
                ...metadata,
                scheduledTime: time
            };

            const { data, error } = await supabase
                .from(TABLES.SPECIAL_COLLECTIONS)
                .update({
                    status: 'scheduled',
                    scheduled_date: date,
                    metadata: updatedMetadata,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single();

            if (error) {
                console.error('Supabase schedule update error:', error);
                return { error };
            }

            console.log('Successfully scheduled collection:', data);

            // 1. Create Display Date/Time for notifications
            const [y, m, d] = date.split('-').map(Number);
            const [h, min] = time.split(':').map(Number);
            const dateObj = new Date(y, m - 1, d, h, min);

            const displayDate = dateObj.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });

            const ampm = h >= 12 ? 'PM' : 'AM';
            const displayHour = h % 12 || 12;
            const displayMin = min < 10 ? '0' + min : min;
            const displayTime = `${displayHour}:${displayMin} ${ampm}`;
            const displayDateTime = `${displayDate}, ${displayTime}`;

            const SUPABASE_URL = 'https://bfqktqtsjchbmopafgzf.supabase.co';
            const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcWt0cXRzamNoYm1vcGFmZ3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDgwMTIsImV4cCI6MjA4NTc4NDAxMn0.Xu7Ncwr5bWYF8x2t5h7XHw_nPrjlTSkQEdnQB4OtcNo';

            // 🔔 A. Notify the RESIDENT (In-app + Push)
            if (data && data.resident_id) {
                // In-app Logic remains
                await supabase.from(TABLES.NOTIFICATIONS).insert({
                    title: "Collection Scheduled | Gi-eskedyul ang pagkolekta ✅",
                    message: `Your waste collection for ${data.waste_type} has been scheduled for ${displayDateTime}. \n\n Gi-eskedyul na ang pagkolekta sa imong ${data.waste_type} karon ${displayDateTime}.`,
                    user_id: data.resident_id,
                    barangay: 'targeted',
                    type: 'schedule_update',
                    created_at: new Date().toISOString()
                });

                // ✅ DB TRIGGER handles the Push (REMOVED MANUAL FETCH)
            }

            // 🚨 B. Notify ALL COLLECTORS (In-app + Push)
            try {
                // Get all collector IDs with a broader role filter
                console.log('🔍 Searching for collectors in database...');
                
                const [{ data: usersWithRole }, { data: registeredCollectors }] = await Promise.all([
                    supabase.from('users').select('id, role, email'),
                    supabase.from('registered_collectors').select('user_id, email')
                ]);

                console.log('   - users table role samples:', (usersWithRole || []).slice(0, 5).map(u => ({ id: u.id, role: u.role })));

                const collectorsFromUsers = (usersWithRole || [])
                    .filter(u => u.role && (u.role.toLowerCase() === 'collector'))
                    .map(u => u.id);

                const collectorsFromRegistered = (registeredCollectors || [])
                    .map(c => c.user_id);

                const allCollectorIds = Array.from(new Set([
                    ...collectorsFromUsers,
                    ...collectorsFromRegistered
                ])).filter(Boolean);

                console.log(`📣 Found collectors: ${allCollectorIds.length}`, allCollectorIds);
                if (allCollectorIds.length === 0) {
                    console.warn('%c⚠️ NO COLLECTORS FOUND! Checking all users for roles:', 'color: orange; font-weight: bold;');
                    console.log('   Users summary:', (usersWithRole || []).map(u => `${u.email}: ${u.role}`).join(', '));
                }

                if (allCollectorIds.length > 0) {
                    const collectorTitle = 'NEW SPECIAL COLLECTION | BAG-ONG SPECIAL COLLECTION';
                    const collectorBody = `New collection for ${data.waste_type} scheduled for ${displayDateTime} at ${data.pickup_location || 'Resident Location'}. \n\n Bag-ong schedule sa pagkolekta para sa ${data.waste_type} karong ${displayDateTime} sa ${data.pickup_location || 'Resident Location'}.`;

                    console.log('%c🔔 SENDING NOTIFICATIONS TO COLLECTORS:', 'color: white; background: #1e40af; padding: 5px; font-weight: bold;');
                    console.table(allCollectorIds.map(id => ({ collectorId: id, title: collectorTitle })));

                    for (const collectorId of allCollectorIds) {
                        // ✅ DB TRIGGER handles the collector's push automatically.
                        // We just insert the in-app record here.
                        await supabase.from(TABLES.NOTIFICATIONS).insert({
                            title: collectorTitle,
                            message: collectorBody,
                            user_id: collectorId,
                            barangay: 'targeted',
                            created_at: new Date().toISOString()
                        });
                    }
                } else {
                    console.warn('⚠️ No collectors found to notify.');
                }
            } catch (collectorNotifErr) {
                console.error('Error in collector notification sequence:', collectorNotifErr);
            }

            // 🚛 C. Add to Collector's Schedules (collection_schedules table)
            if (data) {
                try {
                    const [y, m, d] = date.split('-').map(Number);
                    const [h, min] = time.split(':').map(Number);
                    const scheduleDateObj = new Date(y, m - 1, d, h, min);
                    const isoScheduledDate = scheduleDateObj.toISOString();

                    const metadata = data.metadata || {};
                    const street = metadata.residentStreet || '';
                    const age = metadata.residentAge || '';
                    const quantity = data.estimated_quantity || '';
                    const residentMsg = data.message || data.special_instructions || '';
                    const fullAddress = `${data.pickup_location || ''}${street ? `, ${street}` : ''}`;

                    await supabase
                        .from(TABLES.COLLECTION_SCHEDULES || 'collection_schedules')
                        .insert({
                            zone: data.resident_barangay || '',
                            name: `Special Collection: ${data.resident_name || 'Resident'} (${data.waste_type || 'Waste'})`,
                            description: `Location: ${fullAddress}, Resident: ${data.resident_name || ''}${age ? `, Age: ${age}` : ''}${quantity ? `, Quantity: ${quantity}` : ''}${residentMsg ? `, Message: ${residentMsg}` : ''}`,
                            resident_name: data.resident_name || '',
                            pickup_location: data.pickup_location || '',
                            status: 'Scheduled',
                            scheduled_date: isoScheduledDate,
                            collection_time: isoScheduledDate,
                            updated_at: new Date().toISOString()
                        });
                } catch (err) {
                    console.error('Error in post-schedule processing:', err);
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
                area: (doc.address && doc.address !== 'Unknown Area') ? doc.address : (doc.zone || doc.area || ''),
                serviceArea: doc.zone,
                status: doc.status || 'pending',
                scheduledDate: doc.scheduled_date || doc.created_at,
                residentName: doc.resident_name || '',
                pickupLocation: doc.pickup_location || '',
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
                zone: payload.area || payload.serviceArea || payload.barangay || '',
                name: payload.name || payload.description || 'Eco Collection',
                description: payload.description || payload.name || '',
                status: payload.status || 'scheduled',
                scheduled_date: payload.scheduledDate instanceof Date ? payload.scheduledDate.toISOString() : payload.scheduledDate,
                collection_time: payload.scheduledDate instanceof Date ? payload.scheduledDate.toISOString() : payload.scheduledDate,
                resident_name: payload.residentName || '',
                pickup_location: payload.pickupLocation || '',
                is_rescheduled: payload.isRescheduled || false,
                original_date: payload.originalDate instanceof Date ? payload.originalDate.toISOString() : payload.originalDate,
                rescheduled_reason: payload.rescheduledReason || '',
                updated_at: new Date().toISOString()
            };
            // This is the only way to "faithfully" insert the structure and ensure syntactic correctness.
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
            if (updates.scheduledDate) {
                const isoDate = updates.scheduledDate instanceof Date ? updates.scheduledDate.toISOString() : updates.scheduledDate;
                dbUpdates.scheduled_date = isoDate;
                dbUpdates.collection_time = isoDate;
            }
            if (updates.isRescheduled !== undefined) dbUpdates.is_rescheduled = updates.isRescheduled;
            if (updates.residentName !== undefined) dbUpdates.resident_name = updates.residentName;
            if (updates.pickupLocation !== undefined) dbUpdates.pickup_location = updates.pickupLocation;
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

    // Delete area schedule
    async deleteAreaSchedule(id) {
        console.log('🗑️ [DB] Attempting to delete Area Schedule with ID:', id);
        try {
            const { data, error, count } = await supabase
                .from(TABLES.AREA_SCHEDULES || 'area_schedules')
                .delete({ count: 'exact' })
                .eq('id', id);

            if (error) {
                console.error('🗑️ [DB] Delete Failed for ID:', id, error);
                throw error;
            }
            
            console.log(`🗑️ [DB] Delete Successful! Removed ${count} rows.`);
            return { data, error: null, count };
        } catch (error) {
            console.error('🗑️ [DB] Critical error in deleteAreaSchedule:', error);
            return { data: null, error };
        }
    },

    // Delete special collection
    async deleteSpecialCollection(id) {
        console.log('🗑️ [DB] Attempting to delete Special Collection with ID:', id);
        try {
            const { error } = await supabase
                .from(TABLES.SPECIAL_COLLECTIONS)
                .delete()
                .eq('id', id);

            if (error) throw error;
            console.log('🗑️ [DB] Special Collection deleted successfully');
            return { error: null };
        } catch (error) {
            console.error('🗑️ [DB] Error in deleteSpecialCollection:', error);
            return { error };
        }
    },

    // Send push notification via Edge Function
    async sendPushNotification(userId, title, body) {
        if (!userId) return { error: 'No user ID provided' };
        try {
            const { data, error } = await supabase.functions.invoke('send-push-v2', {
                headers: {
                    'apikey': SUPABASE_ANON_KEY
                },
                body: {
                    resident_id: userId,
                    title: title,
                    body: body
                }
            });
            return { data, error };
        } catch (error) {
            console.error('sendPushNotification caught error:', error);
            return { error };
        }
    },

    // Broadcast push notification to ALL registered devices (bypasses resident_id lookup)
    async broadcastPushNotification(title, body) {
        try {
            const { data, error } = await supabase.functions.invoke('send-push-v2', {
                headers: {
                    'apikey': SUPABASE_ANON_KEY
                },
                body: {
                    broadcast: true,
                    title: title,
                    body: body
                }
            });
            return { data, error };
        } catch (error) {
            console.error('broadcastPushNotification caught error:', error);
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

    // Get notifications
    async getNotifications(limitCount = 50, userId = null) {
        try {
            let baseQuery = supabase
                .from(TABLES.NOTIFICATIONS)
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limitCount);

            if (userId) {
                baseQuery = baseQuery.eq('user_id', userId);
            }

            const { data, error } = await baseQuery;

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

            return { data: mappedData || [], error: null };
        } catch (error) {
            console.error('Error in getNotifications:', error);
            return { data: [], error };
        }
    },

    // Get accurate notification counts
    async getNotificationCounts(userId = null) {
        try {
            // Get unread personal notifications count
            let personalQuery = supabase
                .from(TABLES.NOTIFICATIONS)
                .select('*', { count: 'exact', head: true })
                .eq('is_read', false);

            if (userId) {
                personalQuery = personalQuery.eq('user_id', userId);
            }

            const { count: unreadPersonal, error: personalError } = await personalQuery;
            
            // For now, community notifications are always counted as read or unread based on your needs
            // In this specific app, admins consider 'user_notifications' as the primary source of unread alerts
            // Count community notifications from last 24h as "today's" or similar if needed
            
            return { 
                unread: unreadPersonal || 0,
                error: personalError
            };
        } catch (error) {
            console.error('Error in getNotificationCounts:', error);
            return { unread: 0, error };
        }
    },
    // Create notification
    async createNotification(notificationData) {
        try {
            const dbPayload = {
                title: notificationData.title,
                message: notificationData.message,
                type: notificationData.type || 'info',
                priority: notificationData.priority || 'medium',
                is_read: false,
                created_at: new Date().toISOString()
            };

            // Support both targeted (user_id) and broad (barangay) notifications
            if (notificationData.userId || notificationData.user_id) {
                dbPayload.user_id = notificationData.userId || notificationData.user_id;
            }
            
            if (notificationData.barangay) {
                dbPayload.barangay = notificationData.barangay;
            }

            const { data, error } = await supabase
                .from(TABLES.NOTIFICATIONS)
                .insert(dbPayload)
                .select()
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error in createNotification:', error);
            return { data: null, error };
        }
    },


    // Update notification
    async updateNotification(id, updates) {
        console.log('💾 dbService.updateNotification called:', { id, updates });
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
                .select(); // Removed .single() to be more resilient to zero matches

            if (error) {
                console.error('❌ Supabase update error:', error);
                throw error;
            }

            const rowsAffected = data?.length || 0;
            console.log(`✅ Update successful, rows affected: ${rowsAffected}`);
            
            return { data: data?.[0] || null, error: null };
        } catch (error) {
            console.error('❌ Catch-all error in updateNotification:', error);
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
                supabase.from(TABLES.BINS || 'bins').select('id, updated_at'),
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

                totalCollectors: Math.max(
                    userList.filter(u => u.role === 'collector').length,
                    collectorList.length
                ),
                activeCollectors: collectorList.filter(c => c.status === 'active' || c.status === 'available').length ||
                    userList.filter(u => u.role === 'collector' && u.status === 'active').length,

                iotUsers: binList.length,
                onlineSensors: binList.filter(b => {
                    if (b.status === 'inactive') return false;
                    if (!b.updated_at) return false;
                    const lastUpdate = new Date(b.updated_at);
                    const diffMinutes = (now - lastUpdate) / 1000 / 60;
                    return diffMinutes <= 2;
                }).length,
                offlineSensors: binList.filter(b => {
                    if (b.status === 'inactive') return true;
                    if (!b.updated_at) return true;
                    const lastUpdate = new Date(b.updated_at);
                    const diffMinutes = (now - lastUpdate) / 1000 / 60;
                    return diffMinutes > 2;
                }).length,
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
        const channelName = `users-changes-${Math.random().toString(36).substring(7)}`;
        return supabase
            .channel(channelName)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.USERS },
                (payload) => {
                    dbService.getUsers().then(({ data }) => {
                        if (data) callback(data);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to activities
    subscribeToActivities(callback, limitCount = 10) {
        const channelName = `activities-changes-${Math.random().toString(36).substring(7)}`;
        return supabase
            .channel(channelName)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.USER_ACTIVITIES },
                (payload) => {
                    dbService.getUserActivities(limitCount).then(({ data }) => {
                        if (data) callback(data);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to system stats
    subscribeToStats(callback) {
        const channelName = `stats-changes-${Math.random().toString(36).substring(7)}`;
        return supabase
            .channel(channelName)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.USERS },
                (payload) => {
                    dbService.getSystemStats().then(({ data }) => {
                        if (data) callback(data);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to collectors
    subscribeToCollectors(callback) {
        const channelName = `collectors-changes-${Math.random().toString(36).substring(7)}`;
        return supabase
            .channel(channelName)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.REGISTERED_COLLECTORS },
                (payload) => {
                    dbService.getCollectors().then(({ data }) => {
                        if (data) callback(data, payload);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to resident feedback
    subscribeToResidentFeedback(callback) {
        const channelName = `feedback-changes-${Math.random().toString(36).substring(7)}`;
        return supabase
            .channel(channelName)
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
        const channelName = `announcements-changes-${Math.random().toString(36).substring(7)}`;
        return supabase
            .channel(channelName)
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

    // Subscribe to notifications
    subscribeToNotifications(callback, userId = null) {
        const filter = userId 
            ? { event: '*', schema: 'public', table: TABLES.NOTIFICATIONS, filter: `user_id=eq.${userId}` }
            : { event: '*', schema: 'public', table: TABLES.NOTIFICATIONS };

        const channelName = `notifications-changes-${Math.random().toString(36).substring(7)}`;
        return supabase
            .channel(channelName)
            .on('postgres_changes',
                filter,
                (payload) => {
                    dbService.getNotifications(50, userId).then(({ data }) => {
                        if (data) callback(data, payload);
                    });
                }
            )
            .subscribe();
    },

    // Subscribe to collection schedules
    subscribeToCollectionSchedules(callback) {
        const channelName = `schedules-changes-${Math.random().toString(36).substring(7)}`;
        return supabase
            .channel(channelName)
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
        const channelName = `area-schedules-changes-${Math.random().toString(36).substring(7)}`;
        return supabase
            .channel(channelName)
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
        const channelName = `bins-changes-${Math.random().toString(36).substring(7)}`;
        return supabase
            .channel(channelName)
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
        const channelName = `special-collections-changes-${Math.random().toString(36).substring(7)}`;
        return supabase
            .channel(channelName)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: TABLES.SPECIAL_COLLECTIONS },
                (payload) => {
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

        // Ensure we handle UTC strings correctly by appending Z if missing and not already there
        let dateStr = typeof date === 'string' ? date : date.toString();
        if (typeof date === 'string' && !date.includes('Z') && !date.includes('+')) {
            dateStr += 'Z';
        }

        const dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) return 'Invalid Date';

        return dateObj.toLocaleString('en-US', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    },

    // Get relative time (e.g., "5m ago", "2h ago")
    getRelativeTime(date) {
        if (!date) return 'N/A';

        // Ensure we handle UTC strings correctly
        let dateStr = typeof date === 'string' ? date : date.toString();
        if (typeof date === 'string' && !date.includes('Z') && !date.includes('+')) {
            dateStr += 'Z';
        }

        // Current time in Manila
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
        const past = new Date(new Date(dateStr).toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
        
        if (isNaN(past.getTime())) return 'N/A';
        
        const diffInSeconds = Math.floor((now - past) / 1000);

        if (diffInSeconds < 0) return 'Just now'; // Handle slight clock skews
        if (diffInSeconds < 60) return 'Just now';
        
        if (diffInSeconds < 3600) {
            const mins = Math.floor(diffInSeconds / 60);
            return `${mins}m ago`;
        }
        
        if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours}h ago`;
        }
        
        if (diffInSeconds < 604800) {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days}d ago`;
        }

        return this.formatDate(date);
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
