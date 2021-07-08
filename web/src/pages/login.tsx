import React from "react";
import { Formik, Form } from "formik";
import { Wrapper } from "../components/Wrapper";
import { InputField } from "../components/InputField";
import { Button } from "@chakra-ui/react";
import { useLoginMutation } from "../generated/graphql";
import { toErrorMap } from "../utils/toErrorMap";
import { useRouter } from "next/router";
import { createUrqlClient } from "../utils/createUrqlClient";
import { withUrqlClient } from "next-urql";


const Login: React.FC<{}> = () => {
  const router = useRouter()
  const [,login] = useLoginMutation()
  return (
    <Wrapper variant="small">
      <Formik
        initialValues={{ usernameOrEmail: "", password: "" }}
        onSubmit={async (values, {setErrors}) => {
          const response = await login(values);
          if(response.data?.login.errors){
            setErrors(toErrorMap(response.data.login.errors))
          } else if (response.data?.login.user){
            router.push("/")
          }
        }}
      >
        {({ isSubmitting }) => (
          <Form>
            <InputField
              name="usernameOrEmail"
              placeholder="username or email"
              label="Username or Email"
            />
            <InputField
              type="password"
              name="password"
              placeholder="Enter password"
              label="Password"
            />
            <Button mt={4} type="submit" colorScheme="teal" isLoading={isSubmitting}>login</Button>
          </Form>
        )}
      </Formik>
    </Wrapper>
  );
};

export default withUrqlClient(createUrqlClient)(Login);