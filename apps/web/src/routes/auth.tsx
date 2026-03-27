import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const [tab, setTab] = useState<string>("login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">edge.ai</h1>
          <FieldDescription>
            Your AI Italian language coach
          </FieldDescription>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-lg">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-6 grid w-full grid-cols-2">
              <TabsTrigger value="login">Log In</TabsTrigger>
              <TabsTrigger value="register">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <LoginForm />
            </TabsContent>
            <TabsContent value="register">
              <RegisterForm onSwitchToLogin={() => setTab("login")} />
            </TabsContent>
          </Tabs>
        </div>

        <FieldDescription className="mt-6 text-center">
          By continuing, you agree to our{" "}
          <a href="#">Terms of Service</a> and{" "}
          <a href="#">Privacy Policy</a>.
        </FieldDescription>
      </div>
    </div>
  );
}

function LoginForm() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const login = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signIn(email, password),
    onSuccess: () => navigate({ to: "/" }),
  });

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: ({ value }) => login.mutate(value),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        {login.error && (
          <FieldError>{login.error.message}</FieldError>
        )}

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
            <Field>
              <FieldLabel htmlFor="login-email">Email</FieldLabel>
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
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                )}
            </Field>
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
            <Field>
              <FieldLabel htmlFor="login-password">Password</FieldLabel>
              <Input
                id="login-password"
                type="password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              {field.state.meta.isTouched &&
                field.state.meta.errors.length > 0 && (
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                )}
            </Field>
          )}
        </form.Field>

        <Field>
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? (
              <>
                <Spinner /> Signing in...
              </>
            ) : (
              "Log In"
            )}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}

function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { signUp } = useAuth();
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
    onSuccess: () => navigate({ to: "/" }),
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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        {register.error && (
          <FieldError>{register.error.message}</FieldError>
        )}

        <form.Field
          name="fullName"
          validators={{
            onBlur: ({ value }) => {
              if (!value) return "Full name is required";
              if (value.length < 2) return "Name must be at least 2 characters";
              return undefined;
            },
          }}
        >
          {(field) => (
            <Field>
              <FieldLabel htmlFor="reg-fullname">Full Name</FieldLabel>
              <Input
                id="reg-fullname"
                type="text"
                placeholder="John Doe"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              {field.state.meta.isTouched &&
                field.state.meta.errors.length > 0 && (
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                )}
            </Field>
          )}
        </form.Field>

        <form.Field
          name="dateOfBirth"
          validators={{
            onBlur: ({ value }) => {
              if (!value) return "Date of birth is required";
              const date = new Date(value);
              if (isNaN(date.getTime())) return "Invalid date";
              if (date >= new Date()) return "Date must be in the past";
              return undefined;
            },
          }}
        >
          {(field) => (
            <Field>
              <FieldLabel htmlFor="reg-dob">Date of Birth</FieldLabel>
              <Input
                id="reg-dob"
                type="date"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              {field.state.meta.isTouched &&
                field.state.meta.errors.length > 0 && (
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                )}
            </Field>
          )}
        </form.Field>

        <FieldSeparator />

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
            <Field>
              <FieldLabel htmlFor="reg-email">Email</FieldLabel>
              <Input
                id="reg-email"
                type="email"
                placeholder="you@example.com"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              {field.state.meta.isTouched &&
                field.state.meta.errors.length > 0 && (
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                )}
            </Field>
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
            <Field>
              <FieldLabel htmlFor="reg-password">Password</FieldLabel>
              <Input
                id="reg-password"
                type="password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              {field.state.meta.isTouched &&
                field.state.meta.errors.length > 0 && (
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                )}
            </Field>
          )}
        </form.Field>

        <form.Field
          name="confirmPassword"
          validators={{
            onChangeListenTo: ["password"],
            onBlur: ({ value, fieldApi }) => {
              if (!value) return "Please confirm your password";
              const password = fieldApi.form.getFieldValue("password");
              if (value !== password) return "Passwords do not match";
              return undefined;
            },
            onChange: ({ value, fieldApi }) => {
              if (!fieldApi.state.meta.isTouched) return undefined;
              const password = fieldApi.form.getFieldValue("password");
              if (value && value !== password) return "Passwords do not match";
              return undefined;
            },
          }}
        >
          {(field) => (
            <Field>
              <FieldLabel htmlFor="reg-confirm">Confirm Password</FieldLabel>
              <Input
                id="reg-confirm"
                type="password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              {field.state.meta.isTouched &&
                field.state.meta.errors.length > 0 && (
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                )}
            </Field>
          )}
        </form.Field>

        <Field>
          <Button
            type="submit"
            className="w-full"
            disabled={register.isPending}
          >
            {register.isPending ? (
              <>
                <Spinner /> Creating account...
              </>
            ) : (
              "Create Account"
            )}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
