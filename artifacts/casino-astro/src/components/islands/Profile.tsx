import { useState } from "react";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  User,
  Mail,
  Shield,
  Settings,
  Zap,
  LogOut,
  Edit3,
  Lock,
  Smartphone,
  DollarSign,
  Monitor,
  MapPin,
  Clock,
  Crown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card/50 border border-white/5 backdrop-blur-xl rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="p-2 rounded-lg bg-white/5">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
  disabled = false,
}: {
  label: string;
  description?: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p
          className={`text-sm font-medium ${disabled ? "text-muted-foreground" : "text-white"}`}
        >
          {label}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? "bg-primary" : "bg-white/10"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        aria-checked={enabled}
        role="switch"
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

export default function Profile() {
  const { user, isLoading, isAuthenticated, logout } = useRequireAuth();
  const { toast } = useToast();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [quickSpinEnabled, setQuickSpinEnabled] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [currency, setCurrency] = useState("USD");

  const handleComingSoon = () => {
    toast({
      title: "Coming Soon",
      description: "Profile editing coming soon",
    });
  };

  const handleLogout = () => {
    logout();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="flex items-center gap-4 mb-10">
          <div className="h-20 w-20 rounded-full bg-white/5 animate-pulse" />
          <div className="space-y-2">
            <div className="h-6 w-40 bg-white/5 animate-pulse rounded" />
            <div className="h-4 w-56 bg-white/5 animate-pulse rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-64 bg-white/5 animate-pulse rounded-2xl"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const initials =
    `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.trim() || "P";
  const displayName = user.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
    : (user.email ?? "Player");

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mb-10">
        <div className="relative">
          <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary/40 shadow-[0_0_20px_rgba(234,179,8,0.25)] overflow-hidden">
            {user.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-primary">
                {initials}
              </span>
            )}
          </div>
          <Crown className="absolute -bottom-1 -right-1 h-5 w-5 text-primary drop-shadow-[0_0_4px_rgba(234,179,8,0.8)]" />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{displayName}</h1>
            <Badge
              variant="default"
              className="bg-primary/20 text-primary border border-primary/30"
            >
              Gold Member
            </Badge>
          </div>
          {user.email && (
            <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Member since{" "}
            {new Date().toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="border-white/10 hover:border-destructive/50 hover:text-destructive"
        >
          <LogOut className="h-4 w-4 mr-1.5" />
          Log Out
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Account Overview */}
        <SectionCard title="Account Overview" icon={User}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white/5">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Display Name
                </p>
                <p className="text-sm font-medium text-white">{displayName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white/5">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Email
                </p>
                <p className="text-sm font-medium text-white">
                  {user.email ?? "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white/5">
                <Crown className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Status
                </p>
                <p className="text-sm font-medium text-primary">Gold Member</p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Personal Information */}
        <SectionCard title="Personal Information" icon={Settings}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/5">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    First Name
                  </p>
                  <p className="text-sm font-medium text-white">
                    {user.firstName ?? "—"}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/5">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Last Name
                  </p>
                  <p className="text-sm font-medium text-white">
                    {user.lastName ?? "—"}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/5">
                  <Mail className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Email
                  </p>
                  <p className="text-sm font-medium text-white">
                    {user.email ?? "—"}
                  </p>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleComingSoon}
              className="w-full mt-2 border-white/10 hover:border-primary/50 hover:text-primary"
            >
              <Edit3 className="h-4 w-4 mr-1.5" />
              Edit Profile
            </Button>
          </div>
        </SectionCard>

        {/* Security */}
        <SectionCard title="Security" icon={Shield}>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/5">
                  <Lock className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Password</p>
                  <p className="text-xs text-muted-foreground">
                    Last changed 30 days ago
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleComingSoon}
                className="border-white/10 hover:border-primary/50 hover:text-primary"
              >
                Change
              </Button>
            </div>
            <div className="border-t border-white/5" />
            <ToggleRow
              label="Two-Factor Authentication"
              description="Add an extra layer of security to your account"
              enabled={twoFactorEnabled}
              onToggle={() => {
                setTwoFactorEnabled(!twoFactorEnabled);
                handleComingSoon();
              }}
              disabled
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
              <Smartphone className="h-3.5 w-3.5" />
              <span>Coming soon</span>
            </div>
          </div>
        </SectionCard>

        {/* Gaming Preferences */}
        <SectionCard title="Gaming Preferences" icon={Zap}>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/5">
                  <DollarSign className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Currency</p>
                  <p className="text-xs text-muted-foreground">
                    Preferred display currency
                  </p>
                </div>
              </div>
              <select
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  handleComingSoon();
                }}
                disabled
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white disabled:opacity-50 cursor-not-allowed"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <div className="border-t border-white/5" />
            <ToggleRow
              label="Sound Effects"
              description="Enable game sounds and audio feedback"
              enabled={soundEnabled}
              onToggle={() => setSoundEnabled(!soundEnabled)}
            />
            <div className="border-t border-white/5" />
            <ToggleRow
              label="Quick Spin Mode"
              description="Skip animations for faster gameplay"
              enabled={quickSpinEnabled}
              onToggle={() => setQuickSpinEnabled(!quickSpinEnabled)}
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
              <Settings className="h-3.5 w-3.5" />
              <span>Currency selection coming soon</span>
            </div>
          </div>
        </SectionCard>

        {/* Session Management - full width */}
        <div className="md:col-span-2">
          <SectionCard title="Session Management" icon={Monitor}>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white/5">
                    <Monitor className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      Current Session
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Web Browser
                      </span>
                      <Clock className="h-3 w-3 text-muted-foreground ml-1" />
                      <span className="text-xs text-muted-foreground">
                        Active now
                      </span>
                    </div>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                >
                  Active
                </Badge>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleLogout}
                className="w-full sm:w-auto"
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                Log Out All Sessions
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
