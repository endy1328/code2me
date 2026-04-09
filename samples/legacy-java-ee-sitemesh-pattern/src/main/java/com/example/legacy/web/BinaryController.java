package com.example.legacy.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/application/binary")
public class BinaryController {
  @RequestMapping("/detail/template.as")
  public String detail() {
    return "application/detail/binary";
  }
}
