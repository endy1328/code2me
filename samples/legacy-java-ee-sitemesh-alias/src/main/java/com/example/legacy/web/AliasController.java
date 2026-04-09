package com.example.legacy.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/alias")
public class AliasController {
  @RequestMapping("/page.as")
  public String page() {
    return "alias/page";
  }
}
