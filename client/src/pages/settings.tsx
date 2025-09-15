import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  User, 
  Settings as SettingsIcon, 
  Lock, 
  Users, 
  Palette, 
  Bell, 
  Globe, 
  Shield, 
  LogOut,
  Crown,
  Home,
  ListTodo,
  FolderKanban,
  BookOpen,
  BarChart3,
  KanbanSquare
} from "lucide-react";
import { Link } from "wouter";

// Form schemas
const profileFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email").optional(),
  department: z.string().optional(),
  timezone: z.string().min(1, "Please select a timezone"),
});

const preferencesFormSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  notifications: z.boolean(),
  dashboardLayout: z.enum(["grid", "list"]),
});

type ProfileFormData = z.infer<typeof profileFormSchema>;
type PreferencesFormData = z.infer<typeof preferencesFormSchema>;

interface UserPermissions {
  [resource: string]: string[];
}

interface UserWithPermissions {
  id: string;
  name: string;
  email?: string;
  role: string;
  department?: string;
  permissions?: UserPermissions;
  isActive: boolean;
}

// Define the user type from useAuth
interface AuthUser {
  id: string;
  name: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  role: string;
  department?: string;
  authType?: string;
}

export default function Settings() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("profile");
  
  // Type assertion for user with proper fallback
  const authUser = user as AuthUser | null;

  // Fetch user permissions to determine UI access
  const { data: permissions } = useQuery<{ permissions: UserPermissions }>({
    queryKey: ["/api/auth/permissions"],
    enabled: isAuthenticated,
  });

  // Fetch all users for team management (only if user has read permission)
  const { data: allUsers, isLoading: usersLoading } = useQuery<UserWithPermissions[]>({
    queryKey: ["/api/users"],
    enabled: isAuthenticated && permissions?.permissions?.users?.includes('read'),
  });

  // Profile form
  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: authUser?.name || "",
      email: authUser?.email || "",
      department: authUser?.department || "",
      timezone: "Asia/Manila",
    },
  });

  // Preferences form
  const preferencesForm = useForm<PreferencesFormData>({
    resolver: zodResolver(preferencesFormSchema),
    defaultValues: {
      theme: "light",
      notifications: true,
      dashboardLayout: "grid",
    },
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      return await apiRequest("/api/users/profile", "PATCH", data);
    },
    onSuccess: () => {
      toast({
        title: "Profile updated",
        description: "Your profile has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: PreferencesFormData) => {
      return await apiRequest("/api/users/preferences", "PATCH", data);
    },
    onSuccess: () => {
      toast({
        title: "Preferences updated",
        description: "Your preferences have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to update preferences. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleProfileSubmit = (data: ProfileFormData) => {
    updateProfileMutation.mutate(data);
  };

  const handlePreferencesSubmit = (data: PreferencesFormData) => {
    updatePreferencesMutation.mutate(data);
  };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'manager': return 'bg-blue-100 text-blue-800';
      case 'lead': return 'bg-purple-100 text-purple-800';
      case 'va': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const canAccessTeamManagement = permissions?.permissions?.users?.includes('read');

  return (
    <div className="p-6">
          <div className="max-w-4xl mx-auto">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-4" data-testid="tabs-settings">
                <TabsTrigger value="profile" data-testid="tab-profile">
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </TabsTrigger>
                <TabsTrigger value="account" data-testid="tab-account">
                  <Lock className="w-4 h-4 mr-2" />
                  Account
                </TabsTrigger>
                {canAccessTeamManagement && (
                  <TabsTrigger value="team" data-testid="tab-team">
                    <Users className="w-4 h-4 mr-2" />
                    Team
                  </TabsTrigger>
                )}
                <TabsTrigger value="preferences" data-testid="tab-preferences">
                  <Palette className="w-4 h-4 mr-2" />
                  Preferences
                </TabsTrigger>
              </TabsList>

              {/* Profile Settings Tab */}
              <TabsContent value="profile" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Profile Information</CardTitle>
                    <CardDescription>
                      Update your personal details and professional information
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Avatar Section */}
                    <div className="flex items-center space-x-6">
                      <Avatar className="w-20 h-20">
                        <AvatarImage src={authUser?.profileImageUrl} alt={authUser?.name} />
                        <AvatarFallback className="text-2xl">
                          {authUser?.name?.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="text-lg font-medium text-card-foreground">{authUser?.name}</h3>
                        <p className="text-sm text-muted-foreground">{authUser?.email}</p>
                        <Badge className={`mt-2 ${getRoleColor(authUser?.role || '')}`}>
                          {authUser?.role === 'admin' && <Crown className="w-3 h-3 mr-1" />}
                          {authUser?.role === 'manager' && <Shield className="w-3 h-3 mr-1" />}
                          {authUser?.role}
                        </Badge>
                      </div>
                    </div>

                    <Separator />

                    {/* Profile Form */}
                    <Form {...profileForm}>
                      <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={profileForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Full Name</FormLabel>
                                <FormControl>
                                  <Input {...field} data-testid="input-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={profileForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email Address</FormLabel>
                                <FormControl>
                                  <Input {...field} type="email" data-testid="input-email" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={profileForm.control}
                            name="department"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Department</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="e.g., Operations, Marketing" data-testid="input-department" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={profileForm.control}
                            name="timezone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Timezone</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-timezone">
                                      <SelectValue placeholder="Select timezone" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="Asia/Manila">Manila (GMT+8)</SelectItem>
                                    <SelectItem value="America/New_York">New York (GMT-5)</SelectItem>
                                    <SelectItem value="Europe/London">London (GMT+0)</SelectItem>
                                    <SelectItem value="Asia/Tokyo">Tokyo (GMT+9)</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <Button 
                          type="submit" 
                          disabled={updateProfileMutation.isPending}
                          data-testid="button-save-profile"
                        >
                          {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Account Settings Tab */}
              <TabsContent value="account" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Account Security</CardTitle>
                    <CardDescription>
                      Manage your authentication and security settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Shield className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium">Replit Authentication</h3>
                          <p className="text-sm text-muted-foreground">Connected via Replit OAuth</p>
                        </div>
                      </div>
                      <Badge variant="secondary" data-testid="text-auth-status">Connected</Badge>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <h3 className="font-medium">Session Information</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <Label className="text-muted-foreground">Login Method</Label>
                          <p data-testid="text-login-method">Replit OAuth</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Account Type</Label>
                          <p data-testid="text-account-type">{authUser?.authType || 'Web'}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Last Activity</Label>
                          <p data-testid="text-last-activity">Just now</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Session Status</Label>
                          <p className="text-green-600" data-testid="text-session-status">Active</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-destructive">Sign Out</h3>
                        <p className="text-sm text-muted-foreground">Sign out of your account on this device</p>
                      </div>
                      <Button variant="destructive" onClick={handleLogout} data-testid="button-signout">
                        <LogOut className="w-4 h-4 mr-2" />
                        Sign Out
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Team Management Tab */}
              {canAccessTeamManagement && (
                <TabsContent value="team" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Team Management</CardTitle>
                      <CardDescription>
                        Manage team members, roles, and permissions
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {usersLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {allUsers?.map((teamUser) => (
                            <div key={teamUser.id} className="flex items-center justify-between p-4 border rounded-lg">
                              <div className="flex items-center space-x-4">
                                <Avatar>
                                  <AvatarImage src="" alt={teamUser.name} />
                                  <AvatarFallback>
                                    {teamUser.name?.split(' ').map(n => n[0]).join('').toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <h4 className="font-medium">{teamUser.name}</h4>
                                  <p className="text-sm text-muted-foreground">{teamUser.email}</p>
                                  {teamUser.department && (
                                    <p className="text-xs text-muted-foreground">{teamUser.department}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Badge className={getRoleColor(teamUser.role)}>
                                  {teamUser.role}
                                </Badge>
                                <Badge variant={teamUser.isActive ? "secondary" : "destructive"}>
                                  {teamUser.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </div>
                            </div>
                          )) || (
                            <div className="text-center py-8 text-muted-foreground">
                              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                              <p>No team members found</p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              )}

              {/* Preferences Tab */}
              <TabsContent value="preferences" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>User Preferences</CardTitle>
                    <CardDescription>
                      Customize your interface and notification settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...preferencesForm}>
                      <form onSubmit={preferencesForm.handleSubmit(handlePreferencesSubmit)} className="space-y-6">
                        {/* Theme Settings */}
                        <div className="space-y-4">
                          <h3 className="text-lg font-medium flex items-center">
                            <Palette className="w-5 h-5 mr-2" />
                            Appearance
                          </h3>
                          <FormField
                            control={preferencesForm.control}
                            name="theme"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Theme</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-theme">
                                      <SelectValue placeholder="Select theme" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="light">Light</SelectItem>
                                    <SelectItem value="dark">Dark</SelectItem>
                                    <SelectItem value="system">System</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={preferencesForm.control}
                            name="dashboardLayout"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Dashboard Layout</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-layout">
                                      <SelectValue placeholder="Select layout" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="grid">Grid View</SelectItem>
                                    <SelectItem value="list">List View</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <Separator />

                        {/* Notification Settings */}
                        <div className="space-y-4">
                          <h3 className="text-lg font-medium flex items-center">
                            <Bell className="w-5 h-5 mr-2" />
                            Notifications
                          </h3>
                          <FormField
                            control={preferencesForm.control}
                            name="notifications"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">
                                    Push Notifications
                                  </FormLabel>
                                  <div className="text-sm text-muted-foreground">
                                    Receive notifications for task updates and mentions
                                  </div>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-notifications"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>

                        <Button 
                          type="submit" 
                          disabled={updatePreferencesMutation.isPending}
                          data-testid="button-save-preferences"
                        >
                          {updatePreferencesMutation.isPending ? "Saving..." : "Save Preferences"}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
      </div>
  );
}