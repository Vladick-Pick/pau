import { redirect } from "next/navigation";
import { KeyRoundIcon, LogInIcon, UserIcon } from "lucide-react";

import { loginAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getCurrentSession } from "@/lib/auth/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getCurrentSession();
  if (session) {
    redirect("/");
  }
  const params = await searchParams;
  const isProduction = process.env.NODE_ENV === "production";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>ПАУ</CardTitle>
          <CardDescription>
            Вход в рабочую консоль программы активных участников.
          </CardDescription>
        </CardHeader>
        <form action={loginAction}>
          <CardContent>
            <FieldGroup>
              {params.error === "invalid" ? (
                <Alert variant="destructive">
                  <KeyRoundIcon />
                  <AlertTitle>Доступ не подтвержден</AlertTitle>
                  <AlertDescription>
                    Проверьте логин и пароль. Для входа по роли оставьте логин
                    пустым и выберите нужную роль.
                  </AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel htmlFor="login">Логин</FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <UserIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="login"
                    name="login"
                    type="text"
                    autoComplete="username"
                  />
                </InputGroup>
                <FieldDescription>
                  Для пользователей из раздела доступа.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Пароль</FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <KeyRoundIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </InputGroup>
                <FieldDescription>
                  {isProduction
                    ? "В production используйте выданный пароль."
                    : "В dev-режиме пароли по умолчанию: admin, manager, viewer."}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button className="w-full" name="role" value="MANAGER" type="submit">
              <LogInIcon data-icon="inline-start" />
              Manager
            </Button>
            <Button
              className="w-full"
              name="role"
              value="ADMIN"
              type="submit"
              variant="outline"
            >
              Admin
            </Button>
            <Button
              className="w-full"
              name="role"
              value="VIEWER"
              type="submit"
              variant="ghost"
            >
              Viewer
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
