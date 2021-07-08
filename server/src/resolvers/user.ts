import { MyContext } from "../types";
import { Arg, Field, Resolver, Mutation, Ctx, ObjectType, Query } from "type-graphql";
import { User } from "../entities/User";
import argon2 from "argon2";
import { EntityManager } from "@mikro-orm/postgresql";
import { COOKIE_NAME, FORGOT_PASSWORD_PREFIX } from "../constants";
import { UsernamePasswordInput } from "./UsernamePasswordInput";
import { validateRegister } from "../utils/validateRegister";
import { sendEmail } from "../utils/sendEmail";
import { v4 } from "uuid";

@ObjectType()
class FieldError {
  @Field()
  field: string;
  @Field()
  message: string;
}
@ObjectType()
class UserResponse {
  @Field(() => [FieldError], {nullable: true})
  errors?: FieldError[];

  @Field(() => User, {nullable: true})
  user?: User;
}

@Resolver()
export class UserResolver {

  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg("email") email: string,
    @Ctx() { em, redis }: MyContext
  ){
    const user = await em.findOne(User, { email });
    if(!user){
      return true;
    }
    const token = v4();
    await redis.set(FORGOT_PASSWORD_PREFIX + token, user.id, "ex", 1000*60*60*24)
    sendEmail(
      email, 
      `<a href="http://localhost:3000/change-password/${token}">reset-password</a>`
    )
    return true
  }

  @Mutation(() => UserResponse)
  async changePassword(
    @Arg("token") token: string,
    @Arg("newPassword") newPassword: string,
    @Ctx() {redis, em, req }: MyContext
  ): Promise<UserResponse>{
    if(newPassword.length <= 6){
      return { errors: [
        {
          field: "newPassword",
          message: "password too short"
        }
      ]
    }
    }
    const key = FORGOT_PASSWORD_PREFIX + token
    const userId = await redis.get(key);
    if(!userId){
      return{
        errors: [{
          field: "token",
          message: "token expired",
        }]
      }
    }
    const user = await em.findOne(User, { id: parseInt(userId)});

    if(!user){
      return{
        errors: [{
          field: "token",
          message: "user no longer exits",
        }]
      }
    }
    user.password = await argon2.hash(newPassword);
    await em.persistAndFlush(user);

    await redis.del(key)
    req.session.userId = user!.id;
    return { user }
  }

  @Query(() => User, { nullable: true})
  async me(
    @Ctx() { req, em}: MyContext
  ) {
    if(!req.session.userId){
      return null
    }
    const user = await em.findOne(User, {id: req.session.userId})
    return user;

  }

  @Mutation(() => UserResponse)
  async register(
    @Arg("options") options: UsernamePasswordInput,
    @Ctx() {em, req }: MyContext
  ): Promise<UserResponse> {
    const errors = validateRegister(options);
    if(errors) {
      return { errors };
    }
    const hashedPassword = await argon2.hash(options.password)
    let user;
    try{
      const result = await (em as EntityManager).createQueryBuilder(User).getKnexQuery().insert({
        username: options.username,
        password: hashedPassword,
        email: options.email,
        created_at: new Date(),
        updated_at: new Date(),
      }).returning("*");
      user = result[0]
    } catch(err){
      if(err.code === "23505"){
        return {
          errors: [{
            field: "username",
            message: "username taken"
          }]
        }
      }
    }
    req.session.userId = user.id;
    return {user,}
  }

  @Mutation(() => UserResponse)
  async login(
    @Arg("usernameOrEmail") usernameOrEmail: string,
    @Arg("password") password: string,
    @Ctx() {em, req }: MyContext
  ): Promise<UserResponse> {
    const user = await em.findOne(User, 
      usernameOrEmail.includes("@") ?
    {email: usernameOrEmail}
    : {username: usernameOrEmail}
    );
    if(!user){
      return {
        errors: [{
          field: "usernameOrEmail",
          message: "username or password does not exit",
        }]
      }
    }
    const valid = await argon2.verify(user.password, password);
    if(!valid){
      return {
        errors: [{
          field: "password",
          message: "username or password does not exit"
        }]
      }
    }
    req.session.userId = user.id;

    return {
      user,
    }
  }

  @Mutation(() => Boolean)
  logout(
    @Ctx() {req, res}: MyContext
  ) {
    return new Promise(resolve => req.session.destroy( err => {
      res.clearCookie(COOKIE_NAME)
      if(err) {
        resolve(false)
        return
      }
      resolve(true)
    }))
  }
}