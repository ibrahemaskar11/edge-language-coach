import { useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { GalleryVerticalEnd } from "lucide-react";
import { toast } from "sonner";
import { signUp } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function SignupForm({
  className,
  onSwitchToLogin,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  onSwitchToLogin: () => void;
}) {
  const navigate = useNavigate();

  const register = useMutation({
    mutationFn: (data: {
      email: string;
      password: string;
      fullName: string;
      dateOfBirth: string;
    }) =>
      signUp(data.email, data.password, {
        fullName: data.fullName,
        dateOfBirth: data.dateOfBirth,
      }),
    onSuccess: () => {
      toast.success("Account created!");
      navigate({ to: "/" });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const form = useForm({
    defaultValues: {
      fullName: "",
      dateOfBirth: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    onSubmit: ({ value }) =>
      register.mutate({
        email: value.email,
        password: value.password,
        fullName: value.fullName,
        dateOfBirth: value.dateOfBirth,
      }),
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
            <a href="#" className="flex flex-col items-center gap-2 font-medium">
              <div className="flex h-8 w-8 items-center justify-center rounded-md">
                <GalleryVerticalEnd className="size-6" />
              </div>
              <span className="sr-only">edge.ai</span>
            </a>
            <h1 className="text-xl font-bold">Create your account</h1>
            <div className="text-center text-sm">
              Already have an account?{" "}
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="underline underline-offset-4"
              >
                Log in
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <form.Field
              name="fullName"
              validators={{
                onBlur: ({ value }) => {
                  if (!value) return "Full name is required";
                  if (value.length < 2)
                    return "Name must be at least 2 characters";
                  return undefined;
                },
              }}
            >
              {(field) => (
                <div className="grid gap-2">
                  <Label htmlFor="reg-fullname">Full Name</Label>
                  <Input
                    id="reg-fullname"
                    type="text"
                    placeholder="John Doe"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  <FieldError field={field} />
                </div>
              )}
            </form.Field>

            <form.Field
              name="dateOfBirth"
              validators={{
                onBlur: ({ value }) => {
                  if (!value) return "Date of birth is required";
                  if (new Date(value) >= new Date())
                    return "Date must be in the past";
                  return undefined;
                },
              }}
            >
              {(field) => (
                <div className="grid gap-2">
                  <Label htmlFor="reg-dob">Date of Birth</Label>
                  <Input
                    id="reg-dob"
                    type="date"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  <FieldError field={field} />
                </div>
              )}
            </form.Field>

            <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
              <span className="relative z-10 bg-background px-2 text-muted-foreground">
                Account details
              </span>
            </div>

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
                  <Label htmlFor="reg-email">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="you@example.com"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  <FieldError field={field} />
                </div>
              )}
            </form.Field>

            <form.Field
              name="password"
              validators={{
                onBlur: ({ value }) => {
                  if (!value) return "Password is required";
                  if (value.length < 6)
                    return "Password must be at least 6 characters";
                  return undefined;
                },
              }}
            >
              {(field) => (
                <div className="grid gap-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  <FieldError field={field} />
                </div>
              )}
            </form.Field>

            <form.Field
              name="confirmPassword"
              validators={{
                onChangeListenTo: ["password"],
                onBlur: ({ value, fieldApi }) => {
                  if (!value) return "Please confirm your password";
                  if (value !== fieldApi.form.getFieldValue("password"))
                    return "Passwords do not match";
                  return undefined;
                },
                onChange: ({ value, fieldApi }) => {
                  if (!fieldApi.state.meta.isTouched) return undefined;
                  if (value && value !== fieldApi.form.getFieldValue("password"))
                    return "Passwords do not match";
                  return undefined;
                },
              }}
            >
              {(field) => (
                <div className="grid gap-2">
                  <Label htmlFor="reg-confirm">Confirm Password</Label>
                  <Input
                    id="reg-confirm"
                    type="password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  <FieldError field={field} />
                </div>
              )}
            </form.Field>

            <Button type="submit" className="w-full" disabled={register.isPending}>
              {register.isPending ? (
                <>
                  <Spinner /> Creating account...
                </>
              ) : (
                "Create Account"
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

function FieldError({
  field,
}: {
  field: { state: { meta: { isTouched: boolean; errors: string[] } } };
}) {
  if (!field.state.meta.isTouched || field.state.meta.errors.length === 0)
    return null;
  return (
    <p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
  );
}
