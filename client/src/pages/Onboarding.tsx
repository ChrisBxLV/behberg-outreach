import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileCompletionForm } from "@/components/ProfileCompletionForm";
import { useLocation } from "wouter";

export default function Onboarding() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const alreadyComplete = Boolean(user?.phone && user?.country);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Finish setup</CardTitle>
          <CardDescription>
            Please add your phone number and country to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {alreadyComplete ? (
            <>
              <p className="text-sm text-muted-foreground">You’re all set.</p>
              <Button className="w-full" type="button" onClick={() => setLocation("/app")}>
                Go to dashboard
              </Button>
            </>
          ) : (
            <ProfileCompletionForm onSuccess={() => setLocation("/app")} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
