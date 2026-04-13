package com.example.legacy.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/account")
public class AccountController {
  @RequestMapping("/list.do")
  public String list() {
    return "account/list";
  }
}
