// ==========================================
// BSITHUB Database Layer (Supabase)
// ==========================================

const DB = {
    // Get Supabase client
    client() {
        return window.sb || null;
    },

    // Check if Supabase is available
    isReady() {
        return !!window.sb;
    },

    // ---- AUTH ----

    async signUp(email, password, profile) {
        if (!this.isReady()) return { success: false, message: 'Database not connected' };

        try {
            // 1. Create auth user in Supabase Auth
            const { data: authData, error: authError } = await this.client().auth.signUp({
                email: email,
                password: password
            });

            if (authError) return { success: false, message: authError.message };
            if (!authData.user) return { success: false, message: 'Failed to create account' };

            // 2. Insert profile into users table
            const userRow = {
                id: authData.user.id,
                email: email,
                username: profile.username,
                name: profile.name,
                password_hash: 'supabase_auth',
                role: 'user',
                status: 'active',
                bio: '',
                phone: '',
                location: '',
                avatar: null,
                blocked_users: [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_seen: new Date().toISOString()
            };

            const { error: insertError } = await this.client()
                .from('users')
                .insert(userRow);

            if (insertError) return { success: false, message: insertError.message };

            return { success: true, user: userRow, session: authData.session };

        } catch (err) {
            return { success: false, message: err.message };
        }
    },

    async signIn(email, password) {
        if (!this.isReady()) return { success: false, message: 'Database not connected' };

        try {
            const { data, error } = await this.client().auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) return { success: false, message: error.message };
            if (!data.user) return { success: false, message: 'Login failed' };

            // Fetch user profile
            const profile = await this.getProfile(data.user.id);

            return { success: true, user: profile, session: data.session };

        } catch (err) {
            return { success: false, message: err.message };
        }
    },

    async signOut() {
        if (!this.isReady()) return;
        try {
            await this.client().auth.signOut();
        } catch (err) {
            console.error('Sign out error:', err);
        }
    },

    async getSession() {
        if (!this.isReady()) return null;
        try {
            const { data } = await this.client().auth.getSession();
            return data.session;
        } catch {
            return null;
        }
    },

    // ---- PROFILES ----

    async getProfile(userId) {
        if (!this.isReady()) return null;

        try {
            const { data, error } = await this.client()
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (error || !data) return null;
            return data;
        } catch {
            return null;
        }
    },

    async updateProfile(userId, updates) {
        if (!this.isReady()) return { success: false, message: 'Database not connected' };

        try {
            updates.updated_at = new Date().toISOString();

            const { error } = await this.client()
                .from('users')
                .update(updates)
                .eq('id', userId);

            if (error) return { success: false, message: error.message };
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    },

    async getAllUsers() {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client()
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) return [];
            return data || [];
        } catch {
            return [];
        }
    },

    // ---- POSTS ----

    async createPost(post) {
        if (!this.isReady()) return { success: false, message: 'Database not connected' };

        try {
            const { data, error } = await this.client()
                .from('posts')
                .insert({
                    user_id: post.userId,
                    user_name: post.userName,
                    user_avatar: post.userAvatar,
                    content: post.content,
                    image_url: post.imageUrl,
                    visibility: post.visibility || 'public'
                })
                .select()
                .single();

            if (error) return { success: false, message: error.message };
            return { success: true, post: data };
        } catch (err) {
            return { success: false, message: err.message };
        }
    },

    async getPosts(limit, offset) {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.client()
                .from('posts')
                .select('*')
                .order('created_at', { ascending: false })
                .range(offset || 0, (offset || 0) + (limit || 20) - 1);

            if (error) return [];
            return data || [];
        } catch {
            return [];
        }
    },

    async updatePost(postId, updates) {
        if (!this.isReady()) return { success: false };

        try {
            updates.updated_at = new Date().toISOString();
            const { error } = await this.client()
                .from('posts')
                .update(updates)
                .eq('id', postId);

            return { success: !error };
        } catch {
            return { success: false };
        }
    },

    async deletePost(postId, userId) {
        if (!this.isReady()) return { success: false };

        try {
            const { error } = await this.client()
                .from('posts')
                .delete()
                .eq('id', postId)
                .eq('user_id', userId);

            return { success: !error };
        } catch {
            return { success: false };
        }
    },

    async toggleLike(postId, userId) {
        if (!this.isReady()) return { success: false };

        try {
            // Check if already liked
            const { data: existing } = await this.client()
                .from('post_likes')
                .select('id')
                .eq('post_id', postId)
                .eq('user_id', userId)
                .maybeSingle();

            if (existing) {
                // Unlike
                await this.client().from('post_likes').delete().eq('id', existing.id);
            } else {
                // Like - use upsert to handle conflicts gracefully
                await this.client().from('post_likes').upsert({
                    post_id: postId,
                    user_id: userId,
                    reaction: 'like'
                }, { onConflict: 'post_id, user_id', ignoreDuplicates: true });
            }

            return { success: true, liked: !existing };
        } catch (err) {
            // Silently ignore 409 Conflict errors (already liked)
            if (err?.code === '23505' || err?.status === 409) {
                return { success: true, liked: true };
            }
            return { success: false };
        }
    },

    async getPostLikes(postId) {
        if (!this.isReady()) return [];

        try {
            const { data } = await this.client()
                .from('post_likes')
                .select('user_id, reaction')
                .eq('post_id', postId);

            return data || [];
        } catch {
            return [];
        }
    },

    async addComment(postId, userId, userName, userAvatar, content) {
        if (!this.isReady()) return { success: false };

        try {
            const { data, error } = await this.client()
                .from('post_comments')
                .insert({
                    post_id: postId,
                    user_id: userId,
                    user_name: userName,
                    user_avatar: userAvatar,
                    content: content
                })
                .select()
                .single();

            if (error) return { success: false, message: error.message };
            return { success: true, comment: data };
        } catch {
            return { success: false };
        }
    },

    async getPostComments(postId) {
        if (!this.isReady()) return [];

        try {
            const { data } = await this.client()
                .from('post_comments')
                .select('*')
                .eq('post_id', postId)
                .order('created_at', { ascending: true });

            return data || [];
        } catch {
            return [];
        }
    },

    // ---- REALTIME ----

    onPostsChange(callback) {
        if (!this.isReady()) return;

        this.client()
            .channel('posts-realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'posts'
            }, callback)
            .subscribe();
    },

    onUsersChange(callback) {
        if (!this.isReady()) return;

        this.client()
            .channel('users-realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'users'
            }, callback)
            .subscribe();
    }
};

window.DB = DB;
