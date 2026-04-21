import { useNavigate, Link } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { signIn } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const navigate = useNavigate();

  const login = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signIn(email, password),
    onSuccess: () => {
      toast.success("Welcome back!");
      navigate({ to: "/playground" });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: ({ value }) => login.mutate(value),
  });

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="flex flex-col items-center gap-2">
              <Logo size={40} />
            </div>
            <h1 className="text-xl font-bold">Welcome back</h1>
            <div className="text-center text-sm">
              Don&apos;t have an account?{" "}
              <Link to="/register" className="underline underline-offset-4">
                Sign up
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <form.Field
              name="email"
              validators={{
                onBlur: ({ value }) => {
                  if (!value) return "Email is required";
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
                    return "Invalid email address";
                  return undefined;
                },
              }}
            >
              {(field) => (
                <div className="grid gap-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  {field.state.meta.isTouched &&
                    field.state.meta.errors.length > 0 && (
                      <p className="text-sm text-red-500">
                        {field.state.meta.errors[0]}
                      </p>
                    )}
                </div>
              )}
            </form.Field>

            <form.Field
              name="password"
              validators={{
                onBlur: ({ value }) => {
                  if (!value) return "Password is required";
                  return undefined;
                },
              }}
            >
              {(field) => (
                <div className="grid gap-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  {field.state.meta.isTouched &&
                    field.state.meta.errors.length > 0 && (
                      <p className="text-sm text-red-500">
                        {field.state.meta.errors[0]}
                      </p>
                    )}
                </div>
              )}
            </form.Field>

            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? (
                <>
                  <Spinner /> Signing in...
                </>
              ) : (
                "Login"
              )}
            </Button>
          </div>
        </div>
      </form>
      <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary">
        By clicking continue, you agree to our{" "}
        <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
      </div>
    </div>
  );
}
